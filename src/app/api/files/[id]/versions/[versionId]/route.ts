import { randomUUID } from "node:crypto";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireWorkspacePermission } from "@/lib/rbac";
import { getObjectBuffer, uploadObject } from "@/lib/storage";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string; versionId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id, versionId } = await context.params;
    const version = await prisma.fileVersion.findFirst({
      where: {
        id: versionId,
        fileId: id
      },
      include: {
        file: {
          select: {
            workspaceId: true,
            currentVersionNumber: true,
            checkedOutById: true
          }
        }
      }
    });

    if (!version) {
      throw new ApiError(404, "Version not found.");
    }

    await requireWorkspacePermission(user.id, version.file.workspaceId, "canUploadFiles");

    if (version.file.checkedOutById && version.file.checkedOutById !== user.id) {
      throw new ApiError(409, "This document is checked out by another member.");
    }

    const restoredVersionNumber = version.file.currentVersionNumber + 1;
    const storageKey = `workspaces/${version.file.workspaceId}/versions/${id}/${randomUUID()}-${version.fileName}`;
    const body = await getObjectBuffer(version.storageKey);
    const fileUrl = await uploadObject({
      key: storageKey,
      body,
      contentType: version.fileType,
      contentLength: body.length
    });
    const file = await prisma.file.update({
      where: { id },
      data: {
        storageKey,
        fileUrl,
        fileName: version.fileName,
        fileType: version.fileType,
        size: version.size,
        currentVersionNumber: restoredVersionNumber,
        versions: {
          create: {
            versionNumber: restoredVersionNumber,
            storageKey,
            fileUrl,
            fileName: version.fileName,
            fileType: version.fileType,
            size: version.size,
            changeNote: `Restored from version ${version.versionNumber}`,
            uploadedById: user.id
          }
        }
      }
    });

    return ok({ file });
  } catch (error) {
    return handleRouteError(error);
  }
}
