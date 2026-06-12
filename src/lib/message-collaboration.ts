import { ApiError } from "@/lib/api";
import { requireConversationParticipant } from "@/lib/direct-chat-access";
import { requireOrgChatRoomAccess } from "@/lib/org-chat";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceChannelMembership } from "@/lib/workspace-chat-access";

export type MessageKind = "channel" | "direct" | "organization";

export async function requireMessageAccess(userId: string, messageKind: MessageKind, messageId: string) {
  if (messageKind === "channel") {
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        channelId: true,
        channel: {
          select: {
            workspaceId: true
          }
        }
      }
    });

    if (!message) {
      throw new ApiError(404, "Message not found.");
    }

    await requireWorkspaceChannelMembership(userId, message.channelId);
    return {
      messageId,
      scopeKind: "channel" as const,
      scopeId: message.channelId,
      workspaceId: message.channel.workspaceId
    };
  }

  if (messageKind === "direct") {
    const message = await prisma.directMessage.findUnique({
      where: { id: messageId },
      select: {
        id: true,
        conversationId: true,
        conversation: {
          select: {
            workspaceId: true
          }
        }
      }
    });

    if (!message) {
      throw new ApiError(404, "Message not found.");
    }

    await requireConversationParticipant(userId, message.conversationId);
    return {
      messageId,
      scopeKind: "direct" as const,
      scopeId: message.conversationId,
      workspaceId: message.conversation.workspaceId
    };
  }

  const message = await prisma.orgChatMessage.findUnique({
    where: { id: messageId },
    select: {
      id: true,
      roomId: true
    }
  });

  if (!message) {
    throw new ApiError(404, "Message not found.");
  }

  await requireOrgChatRoomAccess(userId, message.roomId);
  return {
    messageId,
    scopeKind: "organization" as const,
    scopeId: message.roomId,
    workspaceId: null
  };
}

export async function requireChatScopeAccess(userId: string, scopeKind: MessageKind, scopeId: string) {
  if (scopeKind === "channel") {
    const channel = await requireWorkspaceChannelMembership(userId, scopeId);
    return { workspaceId: channel.workspaceId };
  }

  if (scopeKind === "direct") {
    const conversation = await requireConversationParticipant(userId, scopeId);
    return { workspaceId: conversation.workspaceId };
  }

  await requireOrgChatRoomAccess(userId, scopeId);
  return { workspaceId: null };
}
