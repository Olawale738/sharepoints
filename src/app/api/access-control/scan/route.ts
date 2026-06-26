import { z } from "zod";

import { auth } from "@/auth";
import { evaluateAccessScan, hashAccessIp, hashAccessSecret } from "@/lib/access-control";
import { ApiError, handleRouteError, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const scanSchema = z.object({
  accessPointId: z.string().cuid(),
  qrToken: z.string().trim().max(200).nullable().optional(),
  organizationId: z.string().trim().max(80).nullable().optional(),
  method: z.enum(["QR", "NFC_RFID", "MANUAL", "HARDWARE_API"]).default("QR"),
  deviceId: z.string().cuid().nullable().optional(),
  deviceSecret: z.string().trim().max(200).nullable().optional()
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    const parsed = scanSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid access scan.");
    const data = parsed.data;
    if (!data.qrToken && !data.organizationId) {
      throw new ApiError(422, "Provide a Digital ID QR token or organization ID.");
    }

    let deviceId: string | null = null;
    if (data.deviceId) {
      const device = await prisma.accessHardwareDevice.findFirst({
        where: {
          id: data.deviceId,
          accessPointId: data.accessPointId,
          active: true
        }
      });
      if (!device) throw new ApiError(403, "Access device is not registered for this access point.");
      if (!session?.user?.id) {
        if (!device.sharedSecretHash || !data.deviceSecret || hashAccessSecret(data.deviceSecret) !== device.sharedSecretHash) {
          throw new ApiError(401, "Valid access device secret is required.");
        }
      }
      await prisma.accessHardwareDevice.update({
        where: { id: device.id },
        data: { lastSeenAt: new Date() }
      });
      deviceId = device.id;
    } else if (!session?.user?.id) {
      throw new ApiError(401, "Authentication or registered device secret is required.");
    }

    const forwardedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const result = await evaluateAccessScan({
      accessPointId: data.accessPointId,
      qrToken: data.qrToken,
      organizationId: data.organizationId,
      method: data.method,
      scannedById: session?.user?.id ?? null,
      deviceId,
      ipHash: hashAccessIp(forwardedIp),
      userAgent: request.headers.get("user-agent")
    });

    return ok({
      granted: result.granted,
      decision: result.decision,
      reason: result.reason,
      accessPoint: result.accessPoint
        ? {
            id: result.accessPoint.id,
            name: result.accessPoint.name,
            pointType: result.accessPoint.pointType,
            location: result.accessPoint.location
          }
        : null,
      member: result.member,
      verification: result.verification
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
