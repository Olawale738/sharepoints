import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { requireWorkspacePermission } from "@/lib/rbac";
import { recycleFile } from "@/lib/recycle-bin";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const file = await prisma.file.findUnique({
      where: { id },
      include: { versions: { select: { storageKey: true } } }
    });

    if (!file) {
      throw new ApiError(404, "File not found.");
    }

    await requireWorkspacePermission(user.id, file.workspaceId, "canDeleteFiles");

    if (file.legalHold) {
      throw new ApiError(409, "This document is under legal hold and cannot be deleted.");
    }
    const governanceHold = await prisma.governanceHold.findFirst({
      where: {
        status: "ACTIVE",
        OR: [
          { targetType: "FILE", targetId: file.id },
          { targetType: "WORKSPACE", targetId: file.workspaceId }
        ]
      },
      select: { id: true }
    });
    if (governanceHold) {
      throw new ApiError(409, "This document is preserved by an active governance hold.");
    }

    if (file.retentionUntil && file.retentionUntil > new Date()) {
      throw new ApiError(409, `This document is retained until ${file.retentionUntil.toISOString()}.`);
    }

    const recycled = await recycleFile(file.id, user.id);

    await logActivity({
      userId: user.id,
      workspaceId: file.workspaceId,
      action: activityActions.fileDeleted,
      targetId: file.id,
      metadata: {
        fileName: file.fileName,
        size: file.size,
        folderId: file.folderId,
        restoreUntil: recycled?.restoreUntil.toISOString()
      }
    });

    return ok({ deleted: true, recycled: true, restoreUntil: recycled?.restoreUntil });
  } catch (error) {
    return handleRouteError(error);
  }
}
