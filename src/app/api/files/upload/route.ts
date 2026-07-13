import { randomUUID } from "node:crypto";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { createApprovalRequestIfNeeded, initialApprovalStatus } from "@/lib/governance";
import { scanUploadedFile } from "@/lib/file-security";
import { inspectForDlp, recordDlpIncidents } from "@/lib/dlp";
import { prisma } from "@/lib/prisma";
import { requireWorkspacePermission } from "@/lib/rbac";
import { getMaxUploadBytes, uploadObject } from "@/lib/storage";
import { sanitizeFileName } from "@/lib/utils";
import { uploadFileSchema } from "@/lib/validators";
import { runWorkspaceWorkflows } from "@/lib/workflows";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const formData = await request.formData();
    const file = formData.get("file");
    const workspaceId = formData.get("workspaceId");
    const folderId = formData.get("folderId");

    if (!(file instanceof File)) {
      throw new ApiError(422, "A file is required.");
    }

    const parsed = uploadFileSchema.safeParse({
      workspaceId,
      folderId: folderId ? String(folderId) : null
    });

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid upload details.");
    }

    await requireWorkspacePermission(user.id, parsed.data.workspaceId, "canUploadFiles");

    if (file.size <= 0) {
      throw new ApiError(422, "The uploaded file is empty.");
    }

    if (file.size > getMaxUploadBytes()) {
      throw new ApiError(413, "The uploaded file exceeds the configured size limit.");
    }

    if (parsed.data.folderId) {
      const folder = await prisma.folder.findFirst({
        where: {
          id: parsed.data.folderId,
          workspaceId: parsed.data.workspaceId
        },
        select: { id: true }
      });

      if (!folder) {
        throw new ApiError(404, "Folder not found.");
      }
    }

    const fileName = sanitizeFileName(file.name);
    const contentType = file.type || "application/octet-stream";
    const storageKey = [
      "workspaces",
      parsed.data.workspaceId,
      parsed.data.folderId ?? "root",
      `${randomUUID()}-${fileName}`
    ].join("/");
    const arrayBuffer = await file.arrayBuffer();
    const body = Buffer.from(arrayBuffer);
    const scan = scanUploadedFile(fileName, body);
    const dlp = await inspectForDlp(parsed.data.workspaceId, body);

    if (scan.status === "INFECTED") {
      throw new ApiError(415, scan.details);
    }

    if (dlp.action === "BLOCK") {
      await recordDlpIncidents({
        workspaceId: parsed.data.workspaceId,
        userId: user.id,
        result: dlp
      });
      throw new ApiError(422, `Upload blocked by data-loss prevention: ${dlp.classification}.`);
    }

    const fileUrl = await uploadObject({
      key: storageKey,
      body,
      contentType,
      contentLength: body.length
    });

    const approvalStatus = await initialApprovalStatus(user.id, parsed.data.workspaceId);
    const createdFile = await prisma.file.create({
      data: {
        workspaceId: parsed.data.workspaceId,
        folderId: parsed.data.folderId || null,
        uploadedById: user.id,
        fileUrl,
        storageKey,
        fileName,
        fileType: contentType,
        size: file.size,
        scanStatus: scan.status,
        scanDetails: scan.details,
        dlpRestricted: dlp.action === "RESTRICT",
        dlpClassification: dlp.classification,
        downloadRestricted: true,
        approvalStatus,
        approvedById: approvalStatus === "APPROVED" ? user.id : null,
        approvedAt: approvalStatus === "APPROVED" ? new Date() : null,
        versions: {
          create: {
            versionNumber: 1,
            storageKey,
            fileUrl,
            fileName,
            fileType: contentType,
            size: file.size,
            changeNote: "Initial upload",
            uploadedById: user.id
          }
        }
      },
      select: {
        id: true,
        workspaceId: true,
        folderId: true,
        uploadedById: true,
        fileName: true,
        fileType: true,
        size: true,
        scanStatus: true,
        scanDetails: true,
        dlpRestricted: true,
        dlpClassification: true,
        downloadRestricted: true,
        approvalStatus: true,
        approvedById: true,
        approvedAt: true,
        currentVersionNumber: true,
        createdAt: true,
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        }
      }
    });
    await createApprovalRequestIfNeeded({
      status: approvalStatus,
      workspaceId: parsed.data.workspaceId,
      requesterId: user.id,
      targetType: "FILE",
      targetId: createdFile.id,
      title: createdFile.fileName
    });
    await recordDlpIncidents({
      workspaceId: parsed.data.workspaceId,
      fileId: createdFile.id,
      userId: user.id,
      result: dlp
    });
    await runWorkspaceWorkflows({
      workspaceId: parsed.data.workspaceId,
      trigger: "FILE_UPLOADED",
      triggerId: createdFile.id,
      actorId: user.id,
      payload: {
        fileName: createdFile.fileName,
        size: createdFile.size,
        dlpRestricted: createdFile.dlpRestricted
      }
    });

    await logActivity({
      userId: user.id,
      workspaceId: parsed.data.workspaceId,
      action: activityActions.fileUploaded,
      targetId: createdFile.id,
      metadata: {
        fileName: createdFile.fileName,
        size: createdFile.size,
        folderId: createdFile.folderId,
        approvalStatus: createdFile.approvalStatus
      }
    });

    return ok({ file: createdFile }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
