import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { requireOrgChatRoomAccess, requireOrgChatRoomSendAccess } from "@/lib/org-chat";
import { prisma } from "@/lib/prisma";
import { createDirectMessageSchema } from "@/lib/validators";
import {
  isMultipartRequest,
  parseVoiceNoteRequest,
  removeVoiceNote,
  storeVoiceNote,
  StoredVoiceNote
} from "@/lib/voice-notes";

type RouteContext = {
  params: Promise<{ roomId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { roomId } = await context.params;
    await requireOrgChatRoomAccess(user.id, roomId);

    const { searchParams } = new URL(request.url);
    const take = Math.min(Number(searchParams.get("take") ?? 50), 100);
    const messages = await prisma.orgChatMessage.findMany({
      where: {
        roomId
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
    const { roomId } = await context.params;
    const room = await requireOrgChatRoomSendAccess(user.id, roomId);
    let messageBody = "";
    let voiceData: StoredVoiceNote | null = null;

    if (isMultipartRequest(request)) {
      const voiceRequest = await parseVoiceNoteRequest(request);
      messageBody = voiceRequest.body;
      voiceData = await storeVoiceNote({
        voiceNote: voiceRequest.voiceNote,
        mimeType: voiceRequest.mimeType,
        durationMs: voiceRequest.durationMs,
        scope: "organization",
        scopeId: roomId
      });
    } else {
      const body = await request.json();
      const parsed = createDirectMessageSchema.safeParse(body);

      if (!parsed.success) {
        throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid message.");
      }

      messageBody = parsed.data.body;
    }

    let message;

    try {
      message = await prisma.orgChatMessage.create({
        data: {
          roomId,
          authorId: user.id,
          body: messageBody,
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
    } catch (error) {
      await removeVoiceNote(voiceData?.voiceStorageKey).catch(() => undefined);
      throw error;
    }

    await logActivity({
      userId: user.id,
      action: activityActions.orgChatMessageCreated,
      targetId: message.id,
      metadata: {
        roomId,
        audience: room.audience,
        voiceNote: Boolean(voiceData)
      }
    });

    return ok({ message }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
