import { RecycleItemType } from "@prisma/client";
import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";
import { deleteObject } from "@/lib/storage";
import { removeVoiceNote } from "@/lib/voice-notes";

const actionSchema = z.object({
  id: z.string().cuid(),
  action: z.enum(["RESTORE", "PURGE"])
});

function snapshotObject(snapshot: unknown) {
  return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? (snapshot as Record<string, unknown>)
    : {};
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" ? value : null;
}

function optionalDate(value: unknown) {
  return typeof value === "string" ? new Date(value) : null;
}

export async function GET() {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id);
    const items = await prisma.recycleBinItem.findMany({
      where: { restoredAt: null, purgedAt: null },
      orderBy: { deletedAt: "desc" },
      take: 250
    });
    return ok({ items });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id);
    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, "Invalid recycle-bin action.");
    const item = await prisma.recycleBinItem.findUnique({ where: { id: parsed.data.id } });
    if (!item || item.restoredAt || item.purgedAt) throw new ApiError(404, "Recycle-bin item not found.");

    if (parsed.data.action === "RESTORE") {
      if (item.restoreUntil < new Date()) throw new ApiError(410, "The restoration period has expired.");
      const snapshot = snapshotObject(item.snapshot);
      if (item.itemType === RecycleItemType.FILE) {
        await prisma.file.update({
          where: { id: item.itemId },
          data: { deletedAt: null, deletedById: null, restoreUntil: null }
        });
      } else if (item.itemType === RecycleItemType.WORKSPACE) {
        await prisma.workspace.update({
          where: { id: item.itemId },
          data: { deletedAt: null, deletedById: null, restoreUntil: null }
        });
      } else if (item.itemType === RecycleItemType.FOLDER) {
        await prisma.folder.update({
          where: { id: item.itemId },
          data: { deletedAt: null, deletedById: null, restoreUntil: null }
        });
      } else if (item.itemType === RecycleItemType.CHANNEL_MESSAGE) {
        await prisma.chatMessage.update({
          where: { id: item.itemId },
          data: {
            body: optionalString(snapshot.body) ?? "",
            attachmentFileId: optionalString(snapshot.attachmentFileId),
            voiceStorageKey: optionalString(snapshot.voiceStorageKey),
            voiceMimeType: optionalString(snapshot.voiceMimeType),
            voiceSize: optionalNumber(snapshot.voiceSize),
            voiceDurationMs: optionalNumber(snapshot.voiceDurationMs),
            replyToId: optionalString(snapshot.replyToId),
            forwardedFromId: optionalString(snapshot.forwardedFromId),
            editedAt: optionalDate(snapshot.editedAt),
            deletedAt: null
          }
        });
      } else if (item.itemType === RecycleItemType.DIRECT_MESSAGE) {
        await prisma.directMessage.update({
          where: { id: item.itemId },
          data: {
            body: optionalString(snapshot.body) ?? "",
            voiceStorageKey: optionalString(snapshot.voiceStorageKey),
            voiceMimeType: optionalString(snapshot.voiceMimeType),
            voiceSize: optionalNumber(snapshot.voiceSize),
            voiceDurationMs: optionalNumber(snapshot.voiceDurationMs),
            replyToId: optionalString(snapshot.replyToId),
            forwardedFromId: optionalString(snapshot.forwardedFromId),
            editedAt: optionalDate(snapshot.editedAt),
            deletedAt: null
          }
        });
      } else if (item.itemType === RecycleItemType.ORG_MESSAGE) {
        await prisma.orgChatMessage.update({
          where: { id: item.itemId },
          data: {
            body: optionalString(snapshot.body) ?? "",
            voiceStorageKey: optionalString(snapshot.voiceStorageKey),
            voiceMimeType: optionalString(snapshot.voiceMimeType),
            voiceSize: optionalNumber(snapshot.voiceSize),
            voiceDurationMs: optionalNumber(snapshot.voiceDurationMs),
            replyToId: optionalString(snapshot.replyToId),
            forwardedFromId: optionalString(snapshot.forwardedFromId),
            editedAt: optionalDate(snapshot.editedAt),
            deletedAt: null
          }
        });
      }
      await prisma.recycleBinItem.update({
        where: { id: item.id },
        data: { restoredAt: new Date(), restoredById: user.id }
      });
      return ok({ restored: true });
    }

    const snapshot = snapshotObject(item.snapshot);
    if (item.itemType === RecycleItemType.FILE) {
      const file = await prisma.file.findUnique({
        where: { id: item.itemId },
        include: { versions: { select: { storageKey: true } } }
      });
      if (file) {
        const keys = Array.from(new Set([file.storageKey, ...file.versions.map((version) => version.storageKey)]));
        await Promise.all(keys.map((key) => deleteObject(key).catch(() => undefined)));
        await prisma.file.delete({ where: { id: file.id } });
      }
    } else if (item.itemType === RecycleItemType.WORKSPACE) {
      const workspace = await prisma.workspace.findUnique({ where: { id: item.itemId } });
      if (workspace) await prisma.workspace.delete({ where: { id: workspace.id } });
    } else if (item.itemType === RecycleItemType.FOLDER) {
      const folder = await prisma.folder.findUnique({ where: { id: item.itemId } });
      if (folder) await prisma.folder.delete({ where: { id: folder.id } });
    } else if (item.itemType === RecycleItemType.CHANNEL_MESSAGE) {
      await removeVoiceNote(optionalString(snapshot.voiceStorageKey)).catch(() => undefined);
      await prisma.chatMessage.deleteMany({ where: { id: item.itemId } });
    } else if (item.itemType === RecycleItemType.DIRECT_MESSAGE) {
      await removeVoiceNote(optionalString(snapshot.voiceStorageKey)).catch(() => undefined);
      await prisma.directMessage.deleteMany({ where: { id: item.itemId } });
    } else if (item.itemType === RecycleItemType.ORG_MESSAGE) {
      await removeVoiceNote(optionalString(snapshot.voiceStorageKey)).catch(() => undefined);
      await prisma.orgChatMessage.deleteMany({ where: { id: item.itemId } });
    }
    await prisma.recycleBinItem.update({ where: { id: item.id }, data: { purgedAt: new Date() } });
    return ok({ purged: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
