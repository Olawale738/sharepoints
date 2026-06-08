import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { requireWorkspacePermission } from "@/lib/rbac";
import { deleteObject } from "@/lib/storage";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const file = await prisma.file.findUnique({
      where: { id }
    });

    if (!file) {
      throw new ApiError(404, "File not found.");
    }

    await requireWorkspacePermission(user.id, file.workspaceId, "canDeleteFiles");
    await deleteObject(file.storageKey);

    await prisma.file.delete({
      where: { id: file.id }
    });

    await logActivity({
      userId: user.id,
      workspaceId: file.workspaceId,
      action: activityActions.fileDeleted,
      targetId: file.id,
      metadata: {
        fileName: file.fileName,
        size: file.size,
        folderId: file.folderId
      }
    });

    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
