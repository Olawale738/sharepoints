import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership } from "@/lib/rbac";

export async function requireConversationParticipant(userId: string, conversationId: string) {
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
