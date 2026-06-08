import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership, requireWorkspacePermission } from "@/lib/rbac";
import { createDirectMessageSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
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

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { conversationId } = await context.params;
    await requireConversationParticipant(user.id, conversationId);

    const { searchParams } = new URL(request.url);
    const take = Math.min(Number(searchParams.get("take") ?? 50), 100);
    const messages = await prisma.directMessage.findMany({
      where: {
        conversationId
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take
    });

    return ok({ messages: messages.reverse() });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { conversationId } = await context.params;
    const conversation = await requireConversationParticipant(user.id, conversationId);
    await requireWorkspacePermission(user.id, conversation.workspaceId, "canSendMessages");

    const recipientId =
      conversation.participantAId === user.id ? conversation.participantBId : conversation.participantAId;
    const recipientMembership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: recipientId,
          workspaceId: conversation.workspaceId
        }
      },
      select: {
        id: true
      }
    });

    if (!recipientMembership) {
      throw new ApiError(403, "The recipient is no longer in this workspace.");
    }

    const body = await request.json();
    const parsed = createDirectMessageSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid direct message.");
    }

    const message = await prisma.$transaction(async (tx) => {
      const createdMessage = await tx.directMessage.create({
        data: {
          conversationId,
          authorId: user.id,
          body: parsed.data.body
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          }
        }
      });

      await tx.directConversation.update({
        where: {
          id: conversationId
        },
        data: {
          lastMessageAt: createdMessage.createdAt
        }
      });

      return createdMessage;
    });

    await logActivity({
      userId: user.id,
      workspaceId: conversation.workspaceId,
      action: activityActions.directMessageCreated,
      targetId: message.id,
      metadata: { conversationId }
    });

    return ok({ message }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
