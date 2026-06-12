import { SecurityEventType } from "@prisma/client";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { logSecurityEvent } from "@/lib/security";

export async function GET() {
  try {
    const user = await requireUser();
    const devices = await prisma.userDevice.findMany({
      where: { userId: user.id },
      orderBy: { lastSeenAt: "desc" },
      take: 30
    });

    return ok({ devices });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();

    if (typeof body.id !== "string") {
      throw new ApiError(422, "Device is required.");
    }

    const result = await prisma.userDevice.updateMany({
      where: {
        id: body.id,
        userId: user.id
      },
      data: {
        revokedAt: new Date()
      }
    });

    if (!result.count) {
      throw new ApiError(404, "Device not found.");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        sessionVersion: {
          increment: 1
        }
      }
    });
    await logSecurityEvent({
      userId: user.id,
      type: SecurityEventType.DEVICE_REVOKED,
      email: user.email,
      metadata: { deviceId: body.id }
    });

    return ok({ revoked: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
