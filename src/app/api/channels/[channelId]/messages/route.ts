import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { createChatMessageSchema } from "@/lib/validators";
import {
  isMultipartRequest,
  parseVoiceNoteRequest,
  removeVoiceNote,
  storeVoiceNote,
  StoredVoiceNote
} from "@/lib/voice-notes";
import { requireWorkspaceChannelMembership, requireWorkspaceChannelSendAccess } from "@/lib/workspace-chat-access";

type RouteContext = {
  params: Promise<{ channelId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { channelId } = await context.params;
    await requireWorkspaceChannelMembership(user.id, channelId);

    const { searchParams } = new URL(request.url);
    const take = Math.min(Number(searchParams.get("take") ?? 50), 100);
    const messages = await prisma.chatMessage.findMany({
      where: { channelId },
      include: {
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
      },
      orderBy: { createdAt: "desc" },
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
    const { channelId } = await context.params;
    const channel = await requireWorkspaceChannelSendAccess(user.id, channelId);
    let messageBody = "";
    let attachmentFileId: string | null = null;
    let voiceData: StoredVoiceNote | null = null;

    if (isMultipartRequest(request)) {
      const voiceRequest = await parseVoiceNoteRequest(request);
      messageBody = voiceRequest.body;
      voiceData = await storeVoiceNote({
        voiceNote: voiceRequest.voiceNote,
        mimeType: voiceRequest.mimeType,
        durationMs: voiceRequest.durationMs,
        scope: "channels",
        scopeId: channelId
      });
    } else {
      const body = await request.json();
      const parsed = createChatMessageSchema.safeParse(body);

      if (!parsed.success) {
        throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid message.");
      }

      messageBody = parsed.data.body;
      attachmentFileId = parsed.data.attachmentFileId || null;

      if (attachmentFileId) {
        const file = await prisma.file.findFirst({
          where: {
            id: attachmentFileId,
            workspaceId: channel.workspaceId
          },
          select: { id: true }
        });

        if (!file) {
          throw new ApiError(404, "Attachment file not found in this workspace.");
        }
      }
    }

    let message;

    try {
      message = await prisma.chatMessage.create({
        data: {
          channelId,
          authorId: user.id,
          body: messageBody,
          attachmentFileId,
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
          },
          attachmentFile: {
            select: {
              id: true,
              fileName: true,
              fileType: true,
              size: true
            }
          }
        }
      });
    } catch (error) {
      await removeVoiceNote(voiceData?.voiceStorageKey).catch(() => undefined);
      throw error;
    }

    await logActivity({
      userId: user.id,
      workspaceId: channel.workspaceId,
      action: activityActions.messageCreated,
      targetId: message.id,
      metadata: { channelId, voiceNote: Boolean(voiceData) }
    });

    return ok({ message }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
