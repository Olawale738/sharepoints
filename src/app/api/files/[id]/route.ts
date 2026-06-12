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
      where: { id },
      include: {
        versions: {
          select: {
            storageKey: true
          }
        }
      }
    });

    if (!file) {
      throw new ApiError(404, "File not found.");
    }

    await requireWorkspacePermission(user.id, file.workspaceId, "canDeleteFiles");

    if (file.legalHold) {
      throw new ApiError(409, "This document is under legal hold and cannot be deleted.");
    }

    if (file.retentionUntil && file.retentionUntil > new Date()) {
      throw new ApiError(409, `This document is retained until ${file.retentionUntil.toISOString()}.`);
    }

    const storageKeys = Array.from(new Set([file.storageKey, ...file.versions.map((version) => version.storageKey)]));
    await Promise.all(storageKeys.map((storageKey) => deleteObject(storageKey)));

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
