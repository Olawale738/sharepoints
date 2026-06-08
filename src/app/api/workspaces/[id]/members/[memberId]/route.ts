import { WorkspaceRole } from "@prisma/client";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMemberManager } from "@/lib/rbac";
import { updateWorkspaceMemberSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ id: string; memberId: string }>;
};

async function ensureNotLastAdmin(workspaceId: string, memberId: string) {
  const target = await prisma.workspaceMember.findUnique({
    where: { id: memberId }
  });

  if (!target) {
    throw new ApiError(404, "Workspace member not found.");
  }

  if (target.role !== WorkspaceRole.ADMIN) {
    return target;
  }

  const adminCount = await prisma.workspaceMember.count({
    where: {
      workspaceId,
      role: WorkspaceRole.ADMIN
    }
  });

  if (adminCount <= 1) {
    throw new ApiError(409, "A workspace must keep at least one admin.");
  }

  return target;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id, memberId } = await context.params;
    const { isAdminAccess } = await requireWorkspaceMemberManager(user.id, id);

    const body = await request.json();
    const parsed = updateWorkspaceMemberSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid member role.");
    }

    const target = await ensureNotLastAdmin(id, memberId);

    if (target.workspaceId !== id) {
      throw new ApiError(404, "Workspace member not found.");
    }

    if (!isAdminAccess && (target.role === WorkspaceRole.ADMIN || parsed.data.role === WorkspaceRole.ADMIN)) {
      throw new ApiError(403, "Only admins can change admin membership.");
    }

    const member = await prisma.workspaceMember.update({
      where: { id: memberId },
      data: {
        role: parsed.data.role
      },
      include: {
        user: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    await logActivity({
      userId: user.id,
      workspaceId: id,
      action: activityActions.memberUpdated,
      targetId: member.userId,
      metadata: { role: member.role }
    });

    return ok({ member });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id, memberId } = await context.params;
    const { isAdminAccess } = await requireWorkspaceMemberManager(user.id, id);

    const target = await ensureNotLastAdmin(id, memberId);

    if (target.workspaceId !== id) {
      throw new ApiError(404, "Workspace member not found.");
    }

    if (!isAdminAccess && target.role === WorkspaceRole.ADMIN) {
      throw new ApiError(403, "Only admins can remove admin members.");
    }

    await prisma.workspaceMember.delete({
      where: { id: memberId }
    });

    await logActivity({
      userId: user.id,
      workspaceId: id,
      action: activityActions.memberRemoved,
      targetId: target.userId,
      metadata: { role: target.role }
    });

    return ok({ removed: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
