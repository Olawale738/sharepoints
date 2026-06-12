import { handleRouteError, ok, requireUser } from "@/lib/api";
import { createRealtimeToken, realtimeChannelName } from "@/lib/realtime";
import { prisma } from "@/lib/prisma";
import { getAccessibleOrgChatRooms } from "@/lib/org-chat";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const isGlobalAdmin = await hasAnyWorkspaceAdminRole(user.id);
    const [workspaces, conversations, rooms] = await Promise.all([
      prisma.workspace.findMany({
        where: isGlobalAdmin
          ? { deletedAt: null }
          : {
              deletedAt: null,
              members: {
                some: { userId: user.id }
              }
            },
        select: {
          chatChannels: { select: { id: true } }
        }
      }),
      prisma.directConversation.findMany({
        where: {
          OR: [{ participantAId: user.id }, { participantBId: user.id }],
          workspace: { deletedAt: null }
        },
        select: { id: true }
      }),
      getAccessibleOrgChatRooms(user.id)
    ]);
    const capabilities = [
      ...workspaces.flatMap((workspace) =>
        workspace.chatChannels.map((channel) => realtimeChannelName("channel", channel.id))
      ),
      ...conversations.map((conversation) => realtimeChannelName("direct", conversation.id)),
      ...rooms.map((room) => realtimeChannelName("organization", room.id)),
      realtimeChannelName("notifications", user.id)
    ];
    const token = await createRealtimeToken(user.id, capabilities);

    if (!token) {
      return ok({ configured: false }, { status: 503 });
    }

    return Response.json(token);
  } catch (error) {
    return handleRouteError(error);
  }
}
