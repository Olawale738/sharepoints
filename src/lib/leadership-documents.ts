import { randomUUID } from "node:crypto";

import { LeadershipDocumentStatus } from "@prisma/client";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspacePermission, requireAnyWorkspacePermission } from "@/lib/rbac";
import {
  deleteObject,
  getMaxUploadBytes,
  getProtectedDownloadResponse,
  getProtectedInlineResponse,
  uploadObject
} from "@/lib/storage";
import { sanitizeFileName } from "@/lib/utils";

export async function canViewLeadershipDocumentRoom(userId: string) {
  return (
    (await hasAnyWorkspacePermission(userId, "canViewExecutiveBriefing")) ||
    (await hasAnyWorkspacePermission(userId, "canManageEvidenceVault"))
  );
}

export async function requireLeadershipDocumentRoomView(userId: string) {
  if (!(await canViewLeadershipDocumentRoom(userId))) {
    throw new ApiError(403, "Your role cannot view the private leadership document room.");
  }
}

export async function requireLeadershipDocumentRoomManage(userId: string) {
  await requireAnyWorkspacePermission(
    userId,
    "canManageEvidenceVault",
    "Your role cannot manage the private leadership document room."
  );
}

export async function getLeadershipDocuments(userId: string) {
  await requireLeadershipDocumentRoomView(userId);

  return prisma.leadershipDocument.findMany({
    where: {
      deletedAt: null
    },
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      status: true,
      fileName: true,
      fileType: true,
      size: true,
      uploadedById: true,
      createdAt: true,
      updatedAt: true,
      uploadedBy: {
        select: {
          name: true,
          email: true
        }
      }
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200
  });
}

export async function uploadLeadershipDocument(input: {
  userId: string;
  file: File;
  title: string;
  description?: string | null;
  category?: string | null;
}) {
  await requireLeadershipDocumentRoomManage(input.userId);

  if (input.file.size <= 0) {
    throw new ApiError(422, "The uploaded file is empty.");
  }
  if (input.file.size > getMaxUploadBytes()) {
    throw new ApiError(413, "The uploaded file exceeds the configured size limit.");
  }

  const fileName = sanitizeFileName(input.file.name);
  const contentType = input.file.type || "application/octet-stream";
  const storageKey = `leadership-room/${randomUUID()}-${fileName}`;
  const body = Buffer.from(await input.file.arrayBuffer());
  const fileUrl = await uploadObject({
    key: storageKey,
    body,
    contentType,
    contentLength: body.length
  });

  const document = await prisma.leadershipDocument.create({
    data: {
      title: input.title.trim(),
      description: input.description?.trim() || null,
      category: input.category?.trim().toUpperCase() || "EXECUTIVE",
      storageKey,
      fileUrl,
      fileName,
      fileType: contentType,
      size: input.file.size,
      uploadedById: input.userId
    },
    select: {
      id: true,
      title: true,
      description: true,
      category: true,
      status: true,
      fileName: true,
      fileType: true,
      size: true,
      uploadedById: true,
      createdAt: true,
      updatedAt: true,
      uploadedBy: {
        select: {
          name: true,
          email: true
        }
      }
    }
  });

  await logActivity({
    userId: input.userId,
    action: activityActions.leadershipDocumentUploaded,
    targetId: document.id,
    metadata: {
      title: document.title,
      category: document.category,
      size: document.size
    }
  });

  return document;
}

export async function getLeadershipDocumentForAccess(userId: string, id: string) {
  await requireLeadershipDocumentRoomView(userId);
  const document = await prisma.leadershipDocument.findFirst({
    where: {
      id,
      deletedAt: null,
      status: { not: LeadershipDocumentStatus.REVOKED }
    }
  });

  if (!document) {
    throw new ApiError(404, "Leadership document not found.");
  }

  return document;
}

export async function getLeadershipDocumentDownload(userId: string, id: string) {
  const document = await getLeadershipDocumentForAccess(userId, id);
  await logActivity({
    userId,
    action: activityActions.leadershipDocumentDownloaded,
    targetId: document.id,
    metadata: {
      title: document.title,
      fileName: document.fileName
    }
  });

  return getProtectedDownloadResponse(document.storageKey, document.fileName, document.fileType);
}

export async function getLeadershipDocumentPreview(userId: string, id: string) {
  const document = await getLeadershipDocumentForAccess(userId, id);
  return getProtectedInlineResponse(document.storageKey, document.fileName, document.fileType);
}

export async function deleteLeadershipDocument(userId: string, id: string) {
  await requireLeadershipDocumentRoomManage(userId);
  const document = await prisma.leadershipDocument.findUnique({
    where: { id }
  });

  if (!document || document.deletedAt) {
    throw new ApiError(404, "Leadership document not found.");
  }

  await deleteObject(document.storageKey).catch(() => null);
  const deleted = await prisma.leadershipDocument.update({
    where: { id },
    data: {
      status: LeadershipDocumentStatus.REVOKED,
      deletedAt: new Date(),
      deletedById: userId
    }
  });

  await logActivity({
    userId,
    action: activityActions.leadershipDocumentDeleted,
    targetId: deleted.id,
    metadata: {
      title: deleted.title,
      fileName: deleted.fileName
    }
  });

  return deleted;
}
