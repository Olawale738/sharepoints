import { MediaArchiveType, SermonResourceVisibility } from "@prisma/client";
import { randomUUID } from "crypto";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { createMediaArchiveResource } from "@/lib/executive-command-center";
import { getMaxUploadBytes, uploadObject } from "@/lib/storage";
import { sanitizeFileName } from "@/lib/utils";

export const runtime = "nodejs";

function optionalText(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

function mediaTypeFrom(file: File | null, requested?: string | null) {
  if (requested && requested in MediaArchiveType) return requested as MediaArchiveType;
  const type = file?.type ?? "";
  if (type.startsWith("video/")) return MediaArchiveType.VIDEO;
  if (type.startsWith("audio/")) return MediaArchiveType.AUDIO;
  if (type.startsWith("image/")) return MediaArchiveType.IMAGE;
  if (file) return MediaArchiveType.DOCUMENT;
  return MediaArchiveType.LINK;
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const form = await request.formData();
    const fileEntry = form.get("file");
    const file = fileEntry instanceof File && fileEntry.size > 0 ? fileEntry : null;
    const mediaUrl = optionalText(form.get("mediaUrl"));

    if (!file && !mediaUrl) {
      throw new ApiError(422, "Upload a media file or provide a media URL.");
    }
    if (file && file.size > getMaxUploadBytes()) {
      throw new ApiError(413, "Media file is larger than the configured upload limit.");
    }
    const title = String(form.get("title") ?? "").trim();
    const speaker = String(form.get("speaker") ?? "").trim();
    if (title.length < 2 || speaker.length < 2) {
      throw new ApiError(422, "Media title and speaker are required.");
    }

    let uploadedUrl = mediaUrl;
    let storageKey: string | null = null;
    let fileName: string | null = null;
    let fileType: string | null = null;
    let fileSize: number | null = null;

    if (file) {
      fileName = sanitizeFileName(file.name || "letw-media");
      fileType = file.type || "application/octet-stream";
      fileSize = file.size;
      storageKey = `media-archive/${new Date().getUTCFullYear()}/${randomUUID()}-${fileName}`;
      uploadedUrl = await uploadObject({
        key: storageKey,
        body: Buffer.from(await file.arrayBuffer()),
        contentType: fileType,
        contentLength: fileSize
      });
    }

    const tags = optionalText(form.get("tags"))
      ?.split(",")
      .map((tag) => tag.trim())
      .filter(Boolean) ?? [];
    const visibility = optionalText(form.get("visibility"));
    const resource = await createMediaArchiveResource(user.id, {
      workspaceId: optionalText(form.get("workspaceId")),
      organizationUnitId: optionalText(form.get("organizationUnitId")),
      title,
      speaker,
      scripture: optionalText(form.get("scripture")),
      language: optionalText(form.get("language")),
      mediaType: mediaTypeFrom(file, optionalText(form.get("mediaType"))),
      mediaUrl: uploadedUrl,
      mediaStorageKey: storageKey,
      mediaFileName: fileName,
      mediaFileType: fileType,
      mediaSize: fileSize,
      notes: optionalText(form.get("notes")),
      visibility: visibility && visibility in SermonResourceVisibility ? (visibility as SermonResourceVisibility) : SermonResourceVisibility.MEMBERS,
      tags,
      retentionLabel: optionalText(form.get("retentionLabel"))
    });

    return ok({ result: resource }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
