import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership, requireWorkspacePermission } from "@/lib/rbac";
import { startDirectConversationSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function participantPair(userId: string, targetUserId: string) {
  return userId < targetUserId
    ? { participantAId: userId, participantBId: targetUserId }
    : { participantAId: targetUserId, participantBId: userId };
}

const conversationInclude = {
  participantA: {
    select: {
      id: true,
      name: true,
      email: true,
      image: true
    }
  },
  participantB: {
    select: {
      id: true,
      name: true,
      email: true,
      image: true
    }
  },
  messages: {
    orderBy: {
      createdAt: "desc" as const
    },
    take: 25,
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
  }
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspaceMembership(user.id, id);

    const conversations = await prisma.directConversation.findMany({
      where: {
        workspaceId: id,
        OR: [{ participantAId: user.id }, { participantBId: user.id }]
      },
      include: conversationInclude,
      orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
      take: 20
    });

    return ok({
      conversations: conversations.map((conversation) => ({
        ...conversation,
        messages: conversation.messages.reverse()
      }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspacePermission(user.id, id, "canSendMessages");

    const body = await request.json();
    const parsed = startDirectConversationSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid direct conversation.");
    }

    if (parsed.data.targetUserId === user.id) {
      throw new ApiError(422, "Choose another workspace member to message.");
    }

    const targetMembership = await prisma.workspaceMember.findUnique({
      where: {
        userId_workspaceId: {
          userId: parsed.data.targetUserId,
          workspaceId: id
        }
      },
      select: {
        id: true
      }
    });

    if (!targetMembership) {
      throw new ApiError(404, "That user is not a member of this workspace.");
    }

    const pair = participantPair(user.id, parsed.data.targetUserId);
    const existingConversation = await prisma.directConversation.findUnique({
      where: {
        workspaceId_participantAId_participantBId: {
          workspaceId: id,
          ...pair
        }
      },
      include: conversationInclude
    });

    if (existingConversation) {
      return ok({
        conversation: {
          ...existingConversation,
          messages: existingConversation.messages.reverse()
        }
      });
    }

    const conversation = await prisma.directConversation.create({
      data: {
        workspaceId: id,
        createdById: user.id,
        ...pair
      },
      include: conversationInclude
    });

    return ok({ conversation }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
