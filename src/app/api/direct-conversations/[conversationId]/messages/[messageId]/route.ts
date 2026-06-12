import { RecycleItemType } from "@prisma/client";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import {
  ensureMessageAuthor,
  ensureMessageCanStillBeDeleted,
  ensureMessageIsNotDeleted
} from "@/lib/message-policy";
import { requireConversationParticipant } from "@/lib/direct-chat-access";
import { prisma } from "@/lib/prisma";
import { publishRealtime } from "@/lib/realtime";
import { recycleRestoreUntil } from "@/lib/recycle-bin";
import { updateMessageSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ conversationId: string; messageId: string }>;
};

const messageInclude = {
  author: {
    select: {
      id: true,
      name: true,
      email: true,
      image: true
    }
  }
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { conversationId, messageId } = await context.params;
    const conversation = await requireConversationParticipant(user.id, conversationId);
    const body = await request.json();
    const parsed = updateMessageSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid direct message.");
    }

    const existing = await prisma.directMessage.findFirst({
      where: {
        id: messageId,
        conversationId
      },
      select: {
        id: true,
        authorId: true,
        deletedAt: true
      }
    });

    if (!existing) {
      throw new ApiError(404, "Direct message not found.");
    }

    ensureMessageAuthor(existing.authorId, user.id);
    ensureMessageIsNotDeleted(existing.deletedAt);

    const message = await prisma.directMessage.update({
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
      workspaceId: conversation.workspaceId,
      action: activityActions.directMessageEdited,
      targetId: message.id,
      metadata: { conversationId }
    });
    await publishRealtime("direct", conversationId, "message.updated", message);

    return ok({ message });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { conversationId, messageId } = await context.params;
    const conversation = await requireConversationParticipant(user.id, conversationId);
    const existing = await prisma.directMessage.findFirst({
      where: {
        id: messageId,
        conversationId
      },
      select: {
        id: true,
        authorId: true,
        body: true,
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
      throw new ApiError(404, "Direct message not found.");
    }

    ensureMessageAuthor(existing.authorId, user.id);
    ensureMessageIsNotDeleted(existing.deletedAt);
    ensureMessageCanStillBeDeleted(existing.createdAt);

    const deletedAt = new Date();
    const restoreUntil = recycleRestoreUntil();
    const message = await prisma.$transaction(async (transaction) => {
      await transaction.recycleBinItem.create({
        data: {
          workspaceId: conversation.workspaceId,
          itemType: RecycleItemType.DIRECT_MESSAGE,
          itemId: existing.id,
          displayName: existing.body.slice(0, 80) || "Direct message",
          deletedById: user.id,
          deletedAt,
          restoreUntil,
          snapshot: {
            body: existing.body,
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

      return transaction.directMessage.update({
        where: {
          id: messageId
        },
        data: {
          body: "",
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
      workspaceId: conversation.workspaceId,
      action: activityActions.directMessageDeleted,
      targetId: message.id,
      metadata: { conversationId }
    });
    await publishRealtime("direct", conversationId, "message.updated", message);

    return ok({ message });
  } catch (error) {
    return handleRouteError(error);
  }
}
