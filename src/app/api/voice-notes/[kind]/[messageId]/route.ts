import { ApiError, handleRouteError, requireUser } from "@/lib/api";
import { requireConversationParticipant } from "@/lib/direct-chat-access";
import { requireOrgChatRoomAccess } from "@/lib/org-chat";
import { prisma } from "@/lib/prisma";
import { getInlineResponse } from "@/lib/storage";
import { requireWorkspaceChannelMembership } from "@/lib/workspace-chat-access";

type RouteContext = {
  params: Promise<{
    kind: string;
    messageId: string;
  }>;
};

type VoiceNoteRecord = {
  id: string;
  voiceStorageKey: string | null;
  voiceMimeType: string | null;
  deletedAt: Date | null;
};

function voiceFileName(record: VoiceNoteRecord) {
  const mimeType = record.voiceMimeType ?? "audio/webm";
  const extension = mimeType.includes("ogg")
    ? "ogg"
    : mimeType.includes("mp4")
      ? "m4a"
      : mimeType.includes("mpeg")
        ? "mp3"
        : mimeType.includes("wav")
          ? "wav"
          : "webm";

  return `voice-note-${record.id}.${extension}`;
}

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { kind, messageId } = await context.params;
    let voiceNote: VoiceNoteRecord | null = null;

    if (kind === "channel") {
      const message = await prisma.chatMessage.findUnique({
        where: { id: messageId },
        select: {
          id: true,
          channelId: true,
          voiceStorageKey: true,
          voiceMimeType: true,
          deletedAt: true
        }
      });

      if (message) {
        await requireWorkspaceChannelMembership(user.id, message.channelId);
        voiceNote = message;
      }
    } else if (kind === "direct") {
      const message = await prisma.directMessage.findUnique({
        where: { id: messageId },
        select: {
          id: true,
          conversationId: true,
          voiceStorageKey: true,
          voiceMimeType: true,
          deletedAt: true
        }
      });

      if (message) {
        await requireConversationParticipant(user.id, message.conversationId);
        voiceNote = message;
      }
    } else if (kind === "organization") {
      const message = await prisma.orgChatMessage.findUnique({
        where: { id: messageId },
        select: {
          id: true,
          roomId: true,
          voiceStorageKey: true,
          voiceMimeType: true,
          deletedAt: true
        }
      });

      if (message) {
        await requireOrgChatRoomAccess(user.id, message.roomId);
        voiceNote = message;
      }
    } else {
      throw new ApiError(404, "Voice note not found.");
    }

    if (!voiceNote?.voiceStorageKey || voiceNote.deletedAt) {
      throw new ApiError(404, "Voice note not found.");
    }

    return getInlineResponse(
      voiceNote.voiceStorageKey,
      voiceFileName(voiceNote),
      voiceNote.voiceMimeType ?? "audio/webm"
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
