import { RecycleItemType } from "@prisma/client";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import {
  ensureMessageAuthor,
  ensureMessageCanStillBeDeleted,
  ensureMessageIsNotDeleted
} from "@/lib/message-policy";
import { prisma } from "@/lib/prisma";
import { publishRealtime } from "@/lib/realtime";
import { recycleRestoreUntil } from "@/lib/recycle-bin";
import { updateMessageSchema } from "@/lib/validators";
import { requireWorkspaceChannelMembership, requireWorkspaceChannelSendAccess } from "@/lib/workspace-chat-access";

type RouteContext = {
  params: Promise<{ channelId: string; messageId: string }>;
};

const messageInclude = {
  author: {
    select: {
      id: true,
      name: true,
      email: true,
      image: true
    }
  },
  attachmentFile: {
    select: {
      id: true,
      fileName: true,
      fileType: true,
      size: true
    }
  }
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { channelId, messageId } = await context.params;
    const channel = await requireWorkspaceChannelSendAccess(user.id, channelId);
    const body = await request.json();
    const parsed = updateMessageSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid message.");
    }

    const existing = await prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        channelId
      },
      select: {
        id: true,
        authorId: true,
        deletedAt: true
      }
    });

    if (!existing) {
      throw new ApiError(404, "Message not found.");
    }

    ensureMessageAuthor(existing.authorId, user.id);
    ensureMessageIsNotDeleted(existing.deletedAt);

    const message = await prisma.chatMessage.update({
      where: {
        id: messageId
      },
      data: {
        body: parsed.data.body,
        editedAt: new Date()
      },
      include: messageInclude
    });

    await logActivity({
      userId: user.id,
      workspaceId: channel.workspaceId,
      action: activityActions.messageEdited,
      targetId: message.id,
      metadata: { channelId }
    });
    await publishRealtime("channel", channelId, "message.updated", message);

    return ok({ message });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { channelId, messageId } = await context.params;
    const channel = await requireWorkspaceChannelMembership(user.id, channelId);
    const existing = await prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        channelId
      },
      select: {
        id: true,
        authorId: true,
        body: true,
        attachmentFileId: true,
        voiceMimeType: true,
        voiceSize: true,
        voiceDurationMs: true,
        replyToId: true,
        forwardedFromId: true,
        editedAt: true,
        createdAt: true,
        deletedAt: true,
        voiceStorageKey: true
      }
    });

    if (!existing) {
      throw new ApiError(404, "Message not found.");
    }

    ensureMessageAuthor(existing.authorId, user.id);
    ensureMessageIsNotDeleted(existing.deletedAt);
    ensureMessageCanStillBeDeleted(existing.createdAt);

    const deletedAt = new Date();
    const restoreUntil = recycleRestoreUntil();
    const message = await prisma.$transaction(async (transaction) => {
      await transaction.recycleBinItem.create({
        data: {
          workspaceId: channel.workspaceId,
          itemType: RecycleItemType.CHANNEL_MESSAGE,
          itemId: existing.id,
          displayName: existing.body.slice(0, 80) || "Channel message",
          deletedById: user.id,
          deletedAt,
          restoreUntil,
          snapshot: {
            body: existing.body,
            attachmentFileId: existing.attachmentFileId,
            voiceStorageKey: existing.voiceStorageKey,
            voiceMimeType: existing.voiceMimeType,
            voiceSize: existing.voiceSize,
            voiceDurationMs: existing.voiceDurationMs,
            replyToId: existing.replyToId,
            forwardedFromId: existing.forwardedFromId,
            editedAt: existing.editedAt?.toISOString() ?? null
          }
        }
      });

      return transaction.chatMessage.update({
        where: {
          id: messageId
        },
        data: {
          body: "",
          attachmentFileId: null,
          voiceStorageKey: null,
          voiceMimeType: null,
          voiceSize: null,
          voiceDurationMs: null,
          deletedAt
        },
        include: messageInclude
      });
    });

    await logActivity({
      userId: user.id,
      workspaceId: channel.workspaceId,
      action: activityActions.messageDeleted,
      targetId: message.id,
      metadata: { channelId }
    });
    await publishRealtime("channel", channelId, "message.updated", message);

    return ok({ message });
  } catch (error) {
    return handleRouteError(error);
  }
}
