import { randomUUID } from "node:crypto";

import { ApiError } from "@/lib/api";
import { deleteObject, getMaxUploadBytes, uploadObject } from "@/lib/storage";

export const voiceNoteMaxDurationMs = 5 * 60 * 1000;
export const voiceNoteMaxBytes = Math.min(4 * 1024 * 1024, getMaxUploadBytes());

const allowedVoiceMimeTypes = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "video/webm"
]);

function extensionForMimeType(mimeType: string) {
  if (mimeType.includes("ogg")) {
    return "ogg";
  }

  if (mimeType.includes("mp4")) {
    return "m4a";
  }

  if (mimeType.includes("mpeg")) {
    return "mp3";
  }

  if (mimeType.includes("wav")) {
    return "wav";
  }

  return "webm";
}

export type StoredVoiceNote = {
  voiceStorageKey: string;
  voiceMimeType: string;
  voiceSize: number;
  voiceDurationMs: number;
};

export function isMultipartRequest(request: Request) {
  return request.headers.get("content-type")?.toLowerCase().includes("multipart/form-data") ?? false;
}

export async function parseVoiceNoteRequest(request: Request) {
  const formData = await request.formData();
  const voiceNote = formData.get("voiceNote");
  const body = String(formData.get("body") ?? "").trim();
  const durationMs = Number(formData.get("durationMs"));
  const replyToId = String(formData.get("replyToId") ?? "").trim() || null;
  const forwardedFromId = String(formData.get("forwardedFromId") ?? "").trim() || null;

  if (!(voiceNote instanceof File)) {
    throw new ApiError(422, "A recorded voice note is required.");
  }

  if (!Number.isFinite(durationMs) || durationMs < 500 || durationMs > voiceNoteMaxDurationMs) {
    throw new ApiError(422, "Voice notes must be between 1 second and 5 minutes.");
  }

  if (voiceNote.size <= 0) {
    throw new ApiError(422, "The recorded voice note is empty.");
  }

  if (voiceNote.size > voiceNoteMaxBytes) {
    throw new ApiError(413, "The voice note exceeds the 4 MB limit.");
  }

  const mimeType = voiceNote.type.toLowerCase().split(";")[0];

  if (!allowedVoiceMimeTypes.has(mimeType)) {
    throw new ApiError(415, "This audio format is not supported.");
  }

  if (body.length > 4000) {
    throw new ApiError(422, "Voice note caption is too long.");
  }

  return {
    body,
    durationMs: Math.round(durationMs),
    voiceNote,
    mimeType,
    replyToId,
    forwardedFromId
  };
}

export async function storeVoiceNote(input: {
  voiceNote: File;
  mimeType: string;
  durationMs: number;
  scope: "channels" | "direct" | "organization";
  scopeId: string;
}) {
  const extension = extensionForMimeType(input.mimeType);
  const voiceStorageKey = [
    "voice-notes",
    input.scope,
    input.scopeId,
    `${randomUUID()}.${extension}`
  ].join("/");
  const body = Buffer.from(await input.voiceNote.arrayBuffer());

  await uploadObject({
    key: voiceStorageKey,
    body,
    contentType: input.mimeType,
    contentLength: body.length
  });

  return {
    voiceStorageKey,
    voiceMimeType: input.mimeType,
    voiceSize: body.length,
    voiceDurationMs: input.durationMs
  } satisfies StoredVoiceNote;
}

export async function removeVoiceNote(storageKey?: string | null) {
  if (!storageKey) {
    return;
  }

  await deleteObject(storageKey);
}
