import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import {
  ensureMessageAuthor,
  ensureMessageCanStillBeDeleted,
  ensureMessageIsNotDeleted
} from "@/lib/message-policy";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership } from "@/lib/rbac";
import { updateMessageSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ conversationId: string; messageId: string }>;
};

async function requireConversationParticipant(userId: string, conversationId: string) {
  const conversation = await prisma.directConversation.findUnique({
    where: {
      id: conversationId
    },
    select: {
      id: true,
      workspaceId: true,
      participantAId: true,
      participantBId: true
    }
  });

  if (!conversation) {
    throw new ApiError(404, "Direct conversation not found.");
  }

  if (conversation.participantAId !== userId && conversation.participantBId !== userId) {
    throw new ApiError(403, "You are not a participant in this conversation.");
  }

  await requireWorkspaceMembership(userId, conversation.workspaceId);

  return conversation;
}

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
        createdAt: true,
        deletedAt: true
      }
    });

    if (!existing) {
      throw new ApiError(404, "Direct message not found.");
    }

    ensureMessageAuthor(existing.authorId, user.id);
    ensureMessageIsNotDeleted(existing.deletedAt);
    ensureMessageCanStillBeDeleted(existing.createdAt);

    const message = await prisma.directMessage.update({
      where: {
        id: messageId
      },
      data: {
        body: "",
        deletedAt: new Date()
      },
      include: messageInclude
    });

    await logActivity({
      userId: user.id,
      workspaceId: conversation.workspaceId,
      action: activityActions.directMessageDeleted,
      targetId: message.id,
      metadata: { conversationId }
    });

    return ok({ message });
  } catch (error) {
    return handleRouteError(error);
  }
}
