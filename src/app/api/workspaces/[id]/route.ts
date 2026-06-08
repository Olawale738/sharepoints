import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceAdminAccess } from "@/lib/rbac";
import { deleteObject } from "@/lib/storage";

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
        files: {
          select: {
            storageKey: true
          }
        }
      }
    });

    if (!workspace) {
      throw new ApiError(404, "Workspace not found.");
    }

    for (const file of workspace.files) {
      await deleteObject(file.storageKey);
    }

    await prisma.workspace.delete({
      where: { id }
    });

    await logActivity({
      userId: user.id,
      action: activityActions.workspaceDeleted,
      targetId: workspace.id,
      metadata: {
        name: workspace.name,
        filesDeleted: workspace.files.length
      }
    });

    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
