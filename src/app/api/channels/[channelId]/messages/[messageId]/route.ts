import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import {
  ensureMessageAuthor,
  ensureMessageCanStillBeDeleted,
  ensureMessageIsNotDeleted
} from "@/lib/message-policy";
import { prisma } from "@/lib/prisma";
import { updateMessageSchema } from "@/lib/validators";
import { removeVoiceNote } from "@/lib/voice-notes";
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

    const message = await prisma.chatMessage.update({
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
        deletedAt: new Date()
      },
      include: messageInclude
    });
    await removeVoiceNote(existing.voiceStorageKey).catch(() => undefined);

    await logActivity({
      userId: user.id,
      workspaceId: channel.workspaceId,
      action: activityActions.messageDeleted,
      targetId: message.id,
      metadata: { channelId }
    });

    return ok({ message });
  } catch (error) {
    return handleRouteError(error);
  }
}
