import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { requireConversationParticipant } from "@/lib/direct-chat-access";
import { requireOrgChatRoomAccess, requireOrgChatRoomSendAccess } from "@/lib/org-chat";
import { prisma } from "@/lib/prisma";
import { publishRealtime } from "@/lib/realtime";
import { requireWorkspacePermission } from "@/lib/rbac";
import { requireWorkspaceChannelMembership, requireWorkspaceChannelSendAccess } from "@/lib/workspace-chat-access";

const forwardSchema = z.object({
  sourceKind: z.enum(["channel", "direct", "organization"]),
  sourceMessageId: z.string().min(1),
  destinationKind: z.enum(["channel", "direct", "organization"]),
  destinationId: z.string().min(1)
});

type SourceMessage = {
  id: string;
  body: string;
  voiceStorageKey: string | null;
};

async function getSource(userId: string, kind: z.infer<typeof forwardSchema>["sourceKind"], messageId: string) {
  if (kind === "channel") {
    const message = await prisma.chatMessage.findUnique({ where: { id: messageId } });
    if (!message) throw new ApiError(404, "Source message not found.");
    await requireWorkspaceChannelMembership(userId, message.channelId);
    return message satisfies SourceMessage;
  }

  if (kind === "direct") {
    const message = await prisma.directMessage.findUnique({ where: { id: messageId } });
    if (!message) throw new ApiError(404, "Source message not found.");
    await requireConversationParticipant(userId, message.conversationId);
    return message satisfies SourceMessage;
  }

  const message = await prisma.orgChatMessage.findUnique({ where: { id: messageId } });
  if (!message) throw new ApiError(404, "Source message not found.");
  await requireOrgChatRoomAccess(userId, message.roomId);
  return message satisfies SourceMessage;
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = forwardSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid forwarding request.");
    }

    const source = await getSource(user.id, parsed.data.sourceKind, parsed.data.sourceMessageId);
    const body = source.body || (source.voiceStorageKey ? "Forwarded voice note" : "Forwarded message");
    let message: unknown;

    if (parsed.data.destinationKind === "channel") {
      await requireWorkspaceChannelSendAccess(user.id, parsed.data.destinationId);
      message = await prisma.chatMessage.create({
        data: {
          channelId: parsed.data.destinationId,
          authorId: user.id,
          body,
          forwardedFromId: source.id
        },
        include: { author: { select: { id: true, name: true, email: true, image: true } } }
      });
    } else if (parsed.data.destinationKind === "direct") {
      const conversation = await requireConversationParticipant(user.id, parsed.data.destinationId);
      await requireWorkspacePermission(user.id, conversation.workspaceId, "canSendMessages");
      message = await prisma.directMessage.create({
        data: {
          conversationId: parsed.data.destinationId,
          authorId: user.id,
          body,
          forwardedFromId: source.id
        },
        include: { author: { select: { id: true, name: true, email: true, image: true } } }
      });
      await prisma.directConversation.update({
        where: { id: parsed.data.destinationId },
        data: { lastMessageAt: new Date() }
      });
    } else {
      await requireOrgChatRoomSendAccess(user.id, parsed.data.destinationId);
      message = await prisma.orgChatMessage.create({
        data: {
          roomId: parsed.data.destinationId,
          authorId: user.id,
          body,
          forwardedFromId: source.id
        },
        include: { author: { select: { id: true, name: true, email: true, image: true } } }
      });
    }

    await publishRealtime(parsed.data.destinationKind, parsed.data.destinationId, "message.created", message);
    return ok({ message, destinationKind: parsed.data.destinationKind, destinationId: parsed.data.destinationId });
  } catch (error) {
    return handleRouteError(error);
  }
}
