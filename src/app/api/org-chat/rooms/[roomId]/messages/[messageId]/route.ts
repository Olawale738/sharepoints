import { RecycleItemType } from "@prisma/client";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import {
  ensureMessageAuthor,
  ensureMessageCanStillBeDeleted,
  ensureMessageIsNotDeleted
} from "@/lib/message-policy";
import { requireOrgChatRoomAccess, requireOrgChatRoomSendAccess } from "@/lib/org-chat";
import { prisma } from "@/lib/prisma";
import { publishRealtime } from "@/lib/realtime";
import { recycleRestoreUntil } from "@/lib/recycle-bin";
import { updateMessageSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ roomId: string; messageId: string }>;
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
    const { roomId, messageId } = await context.params;
    const room = await requireOrgChatRoomSendAccess(user.id, roomId);
    const body = await request.json();
    const parsed = updateMessageSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid organization message.");
    }

    const existing = await prisma.orgChatMessage.findFirst({
      where: {
        id: messageId,
        roomId
      },
      select: {
        id: true,
        authorId: true,
        deletedAt: true
      }
    });

    if (!existing) {
      throw new ApiError(404, "Organization message not found.");
    }

    ensureMessageAuthor(existing.authorId, user.id);
    ensureMessageIsNotDeleted(existing.deletedAt);

    const message = await prisma.orgChatMessage.update({
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
      action: activityActions.orgChatMessageEdited,
      targetId: message.id,
      metadata: {
        roomId,
        audience: room.audience
      }
    });
    await publishRealtime("organization", roomId, "message.updated", message);

    return ok({ message });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { roomId, messageId } = await context.params;
    const room = await requireOrgChatRoomAccess(user.id, roomId);
    const existing = await prisma.orgChatMessage.findFirst({
      where: {
        id: messageId,
        roomId
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
      throw new ApiError(404, "Organization message not found.");
    }

    ensureMessageAuthor(existing.authorId, user.id);
    ensureMessageIsNotDeleted(existing.deletedAt);
    ensureMessageCanStillBeDeleted(existing.createdAt);

    const deletedAt = new Date();
    const restoreUntil = recycleRestoreUntil();
    const message = await prisma.$transaction(async (transaction) => {
      await transaction.recycleBinItem.create({
        data: {
          itemType: RecycleItemType.ORG_MESSAGE,
          itemId: existing.id,
          displayName: existing.body.slice(0, 80) || "Organization message",
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

      return transaction.orgChatMessage.update({
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
      action: activityActions.orgChatMessageDeleted,
      targetId: message.id,
      metadata: {
        roomId,
        audience: room.audience
      }
    });
    await publishRealtime("organization", roomId, "message.updated", message);

    return ok({ message });
  } catch (error) {
    return handleRouteError(error);
  }
}
