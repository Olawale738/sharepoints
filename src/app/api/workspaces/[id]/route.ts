import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceAdminAccess } from "@/lib/rbac";
import { recycleWorkspace } from "@/lib/recycle-bin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspaceAdminAccess(user.id, id, "Only admins can delete workspaces.");

    const workspace = await prisma.workspace.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        _count: { select: { files: true } }
      }
    });

    if (!workspace) {
      throw new ApiError(404, "Workspace not found.");
    }
    const activeHold = await prisma.governanceHold.findFirst({
      where: {
        status: "ACTIVE",
        OR: [
          { targetType: "WORKSPACE", targetId: workspace.id },
          { workspaceId: workspace.id }
        ]
      },
      select: { id: true }
    });
    const heldFile = await prisma.file.findFirst({
      where: { workspaceId: workspace.id, legalHold: true },
      select: { id: true }
    });
    if (activeHold || heldFile) {
      throw new ApiError(409, "This workspace is protected by an active governance or legal hold.");
    }

    const recycled = await recycleWorkspace(id, user.id);

    await logActivity({
      userId: user.id,
      action: activityActions.workspaceDeleted,
      targetId: workspace.id,
      metadata: {
        name: workspace.name,
        filesPreserved: workspace._count.files,
        restoreUntil: recycled?.restoreUntil.toISOString()
      }
    });

    return ok({ deleted: true, recycled: true, restoreUntil: recycled?.restoreUntil });
  } catch (error) {
    return handleRouteError(error);
  }
}
