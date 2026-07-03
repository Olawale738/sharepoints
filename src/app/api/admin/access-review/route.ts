import { z } from "zod";
import { WorkspaceRole } from "@prisma/client";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("REMOVE_WORKSPACE_MEMBER"),
    memberId: z.string().cuid()
  }),
  z.object({
    action: z.literal("DELETE_SHARE_LINK"),
    shareLinkId: z.string().cuid()
  }),
  z.object({
    action: z.literal("DISABLE_AI_AGENT"),
    agentId: z.string().cuid()
  }),
  z.object({
    action: z.literal("REVOKE_DEVICE"),
    deviceId: z.string().cuid()
  }),
  z.object({
    action: z.literal("CLEAR_ACCESS_REVIEW_LOGS")
  })
]);

async function ensureNotLastWorkspaceAdmin(memberId: string) {
  const member = await prisma.workspaceMember.findUnique({
    where: { id: memberId },
    include: { workspace: { select: { id: true, name: true } } }
  });

  if (!member) {
    throw new ApiError(404, "Workspace member not found.");
  }

  if (member.role !== WorkspaceRole.ADMIN) {
    return member;
  }

  const adminCount = await prisma.workspaceMember.count({
    where: { workspaceId: member.workspaceId, role: WorkspaceRole.ADMIN }
  });

  if (adminCount <= 1) {
    throw new ApiError(409, "This is the last admin in that workspace. Assign another admin before removing this access.");
  }

  return member;
}

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    await requireAnyWorkspaceAdmin(actor.id, "Only administrators can perform access review actions.");
    const parsed = actionSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid access review action.");
    }

    const data = parsed.data;

    if (data.action === "REMOVE_WORKSPACE_MEMBER") {
      const member = await ensureNotLastWorkspaceAdmin(data.memberId);

      await prisma.workspaceMember.delete({ where: { id: data.memberId } });
      await logActivity({
        userId: actor.id,
        workspaceId: member.workspaceId,
        action: activityActions.memberRemoved,
        targetId: member.userId,
        metadata: {
          source: "advanced_access_review",
          role: member.role,
          workspaceName: member.workspace.name
        }
      });

      return ok({ removed: true });
    }

    if (data.action === "DELETE_SHARE_LINK") {
      const link = await prisma.fileShareLink.findUnique({
        where: { id: data.shareLinkId },
        include: {
          file: {
            select: {
              id: true,
              fileName: true,
              workspaceId: true
            }
          }
        }
      });

      if (!link) {
        throw new ApiError(404, "Share link not found.");
      }

      await prisma.fileShareLink.delete({ where: { id: data.shareLinkId } });
      await logActivity({
        userId: actor.id,
        workspaceId: link.file.workspaceId,
        action: "access_review.share_link_revoked",
        targetId: link.file.id,
        metadata: { fileName: link.file.fileName }
      });

      return ok({ deleted: true });
    }

    if (data.action === "DISABLE_AI_AGENT") {
      const agent = await prisma.workspaceAiAgent.update({
        where: { id: data.agentId },
        data: { enabled: false }
      });

      await logActivity({
        userId: actor.id,
        workspaceId: agent.workspaceId ?? undefined,
        action: activityActions.aiAgentUpdated,
        targetId: agent.id,
        metadata: { source: "advanced_access_review", enabled: false, name: agent.name }
      });

      return ok({ agent });
    }

    if (data.action === "REVOKE_DEVICE") {
      const device = await prisma.userDevice.update({
        where: { id: data.deviceId },
        data: { revokedAt: new Date() }
      });

      await logActivity({
        userId: actor.id,
        action: "access_review.device_revoked",
        targetId: device.userId,
        metadata: { deviceId: device.id, deviceName: device.name }
      });

      return ok({ device });
    }

    const result = await prisma.activityLog.deleteMany({
      where: {
        action: {
          startsWith: "access_review."
        }
      }
    });
    await logActivity({
      userId: actor.id,
      action: "access_review.logs_cleared",
      metadata: { deleted: result.count }
    });

    return ok({ cleared: result.count });
  } catch (error) {
    return handleRouteError(error);
  }
}
