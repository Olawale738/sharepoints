import { randomUUID } from "node:crypto";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { scanUploadedFile } from "@/lib/file-security";
import { ensureCanSeeFile } from "@/lib/governance";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership, requireWorkspacePermission } from "@/lib/rbac";
import { getMaxUploadBytes, uploadObject } from "@/lib/storage";
import { sanitizeFileName } from "@/lib/utils";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const file = await prisma.file.findUnique({
      where: { id },
      select: {
        workspaceId: true,
        uploadedById: true,
        approvalStatus: true,
        sensitivityLabel: true,
        downloadRestricted: true,
        shareRestricted: true,
        aiRestricted: true,
        dlpRestricted: true,
        currentVersionNumber: true,
        checkedOutById: true,
        checkedOutAt: true,
        legalHold: true,
        retentionUntil: true,
        checkedOutBy: {
          select: { name: true, email: true }
        },
        comments: {
          include: {
            author: {
              select: { name: true, email: true }
            }
          },
          orderBy: { createdAt: "desc" },
          take: 50
        },
        versions: {
          include: {
            uploadedBy: {
              select: { name: true, email: true }
            }
          },
          orderBy: { versionNumber: "desc" }
        }
      }
    });

    if (!file) {
      throw new ApiError(404, "File not found.");
    }

    await requireWorkspaceMembership(user.id, file.workspaceId);
    await ensureCanSeeFile(user.id, file);
    return ok({ file });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const existing = await prisma.file.findUnique({
      where: { id }
    });

    if (!existing) {
      throw new ApiError(404, "File not found.");
    }

    await requireWorkspacePermission(user.id, existing.workspaceId, "canUploadFiles");

    if (existing.checkedOutById && existing.checkedOutById !== user.id) {
      throw new ApiError(409, "This document is checked out by another member.");
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const changeNote = String(formData.get("changeNote") ?? "").trim().slice(0, 500);

    if (!(file instanceof File) || file.size <= 0) {
      throw new ApiError(422, "Choose a replacement file.");
    }

    if (file.size > getMaxUploadBytes()) {
      throw new ApiError(413, "The uploaded file exceeds the configured size limit.");
    }

    const fileName = sanitizeFileName(file.name);
    const fileType = file.type || "application/octet-stream";
    const buffer = Buffer.from(await file.arrayBuffer());
    const scan = scanUploadedFile(fileName, buffer);

    if (scan.status === "INFECTED") {
      throw new ApiError(415, scan.details);
    }

    const versionNumber = existing.currentVersionNumber + 1;
    const storageKey = `workspaces/${existing.workspaceId}/versions/${id}/${randomUUID()}-${fileName}`;
    const fileUrl = await uploadObject({
      key: storageKey,
      body: buffer,
      contentType: fileType,
      contentLength: buffer.length
    });

    const updated = await prisma.file.update({
      where: { id },
      data: {
        storageKey,
        fileUrl,
        fileName,
        fileType,
        size: file.size,
        currentVersionNumber: versionNumber,
        scanStatus: scan.status,
        scanDetails: scan.details,
        versions: {
          create: {
            versionNumber,
            storageKey,
            fileUrl,
            fileName,
            fileType,
            size: file.size,
            changeNote: changeNote || null,
            uploadedById: user.id
          }
        }
      },
      include: {
        versions: {
          include: {
            uploadedBy: {
              select: { name: true, email: true }
            }
          },
          orderBy: { versionNumber: "desc" }
        }
      }
    });

    return ok({ file: updated }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
