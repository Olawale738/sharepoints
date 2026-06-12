import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership } from "@/lib/rbac";
import { deviceHeartbeatSchema } from "@/lib/validators";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const workspaceId = new URL(request.url).searchParams.get("workspaceId");

    if (!workspaceId) {
      throw new ApiError(422, "Workspace is required.");
    }

    await requireWorkspaceMembership(user.id, workspaceId);
    const threshold = new Date(Date.now() - 2 * 60 * 1000);
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId },
      select: {
        userId: true,
        user: {
          select: {
            name: true,
            email: true,
            presence: true
          }
        }
      }
    });

    return ok({
      members: members.map((member) => ({
        userId: member.userId,
        name: member.user.name ?? member.user.email,
        status: member.user.presence && member.user.presence.lastSeenAt >= threshold ? member.user.presence.status : "offline",
        lastSeenAt: member.user.presence?.lastSeenAt ?? null
      }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = deviceHeartbeatSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid device heartbeat.");
    }

    const now = new Date();
    const existingDevice = await prisma.userDevice.findUnique({
      where: {
        userId_deviceKey: {
          userId: user.id,
          deviceKey: parsed.data.deviceKey
        }
      },
      select: { revokedAt: true }
    });

    if (existingDevice?.revokedAt) {
      throw new ApiError(403, "This device session has been revoked. Sign in again.");
    }

    const [presence, device] = await prisma.$transaction([
      prisma.userPresence.upsert({
        where: { userId: user.id },
        update: {
          status: "online",
          lastSeenAt: now
        },
        create: {
          userId: user.id,
          status: "online",
          lastSeenAt: now
        }
      }),
      prisma.userDevice.upsert({
        where: {
          userId_deviceKey: {
            userId: user.id,
            deviceKey: parsed.data.deviceKey
          }
        },
        update: {
          name: parsed.data.name || null,
          userAgent: parsed.data.userAgent || null,
          lastSeenAt: now
        },
        create: {
          userId: user.id,
          deviceKey: parsed.data.deviceKey,
          name: parsed.data.name || null,
          userAgent: parsed.data.userAgent || null,
          lastSeenAt: now
        }
      })
    ]);

    return ok({ presence, device });
  } catch (error) {
    return handleRouteError(error);
  }
}
