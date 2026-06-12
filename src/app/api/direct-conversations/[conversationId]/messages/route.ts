import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { requireConversationParticipant } from "@/lib/direct-chat-access";
import { createNotification, notifyMentionedUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { requireWorkspacePermission } from "@/lib/rbac";
import { createDirectMessageSchema } from "@/lib/validators";
import {
  isMultipartRequest,
  parseVoiceNoteRequest,
  removeVoiceNote,
  storeVoiceNote,
  StoredVoiceNote
} from "@/lib/voice-notes";

type RouteContext = {
  params: Promise<{ conversationId: string }>;
};

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

    let messageBody = "";
    let voiceData: StoredVoiceNote | null = null;
    let replyToId: string | null = null;
    let forwardedFromId: string | null = null;

    if (isMultipartRequest(request)) {
      const voiceRequest = await parseVoiceNoteRequest(request);
      messageBody = voiceRequest.body;
      voiceData = await storeVoiceNote({
        voiceNote: voiceRequest.voiceNote,
        mimeType: voiceRequest.mimeType,
        durationMs: voiceRequest.durationMs,
        scope: "direct",
        scopeId: conversationId
      });
      replyToId = voiceRequest.replyToId;
      forwardedFromId = voiceRequest.forwardedFromId;
    } else {
      const body = await request.json();
      const parsed = createDirectMessageSchema.safeParse(body);

      if (!parsed.success) {
        throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid direct message.");
      }

      messageBody = parsed.data.body;
      replyToId = parsed.data.replyToId || null;
      forwardedFromId = parsed.data.forwardedFromId || null;
    }

    if (replyToId || forwardedFromId) {
      const referenceCount = await prisma.directMessage.count({
        where: {
          conversationId,
          id: { in: [replyToId, forwardedFromId].filter(Boolean) as string[] }
        }
      });

      if (referenceCount !== new Set([replyToId, forwardedFromId].filter(Boolean)).size) {
        throw new ApiError(404, "Referenced direct message was not found.");
      }
    }

    let message;

    try {
      message = await prisma.$transaction(async (tx) => {
        const createdMessage = await tx.directMessage.create({
          data: {
            conversationId,
            authorId: user.id,
            body: messageBody,
            replyToId,
            forwardedFromId,
            ...voiceData
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
    } catch (error) {
      await removeVoiceNote(voiceData?.voiceStorageKey).catch(() => undefined);
      throw error;
    }

    await logActivity({
      userId: user.id,
      workspaceId: conversation.workspaceId,
      action: activityActions.directMessageCreated,
      targetId: message.id,
      metadata: { conversationId, voiceNote: Boolean(voiceData) }
    });
    await createNotification({
      userId: recipientId,
      workspaceId: conversation.workspaceId,
      type: "DIRECT_MESSAGE",
      title: `${user.name ?? user.email ?? "A member"} sent you a message`,
      body: messageBody || "Voice note",
      href: `/dashboard/workspaces/${conversation.workspaceId}`
    });
    await notifyMentionedUsers({
      text: messageBody,
      workspaceId: conversation.workspaceId,
      actorId: user.id,
      title: "You were mentioned in a direct message",
      href: `/dashboard/workspaces/${conversation.workspaceId}`
    });

    return ok({ message }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
