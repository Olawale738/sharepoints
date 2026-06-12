import { WorkspaceRole } from "@prisma/client";

import { handleRouteError, ok, requireUser } from "@/lib/api";
import { getAccessibleOrgChatRooms } from "@/lib/org-chat";
import { prisma } from "@/lib/prisma";
import { getRolePermissions, hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export async function GET() {
  try {
    const user = await requireUser();
    const isGlobalAdmin = await hasAnyWorkspaceAdminRole(user.id);
    const workspaceRecords = await prisma.workspace.findMany({
      where: isGlobalAdmin
        ? { deletedAt: null }
        : {
            deletedAt: null,
            members: {
              some: { userId: user.id }
            }
          },
      include: {
        members: {
          where: { userId: user.id },
          select: { role: true }
        },
        chatChannels: {
          select: { id: true, name: true },
          orderBy: { name: "asc" }
        },
        directConversations: {
          where: {
            OR: [{ participantAId: user.id }, { participantBId: user.id }]
          },
          include: {
            participantA: { select: { id: true, name: true, email: true } },
            participantB: { select: { id: true, name: true, email: true } }
          }
        }
      }
    });
    const memberships = workspaceRecords.map((workspace) => ({
      workspaceId: workspace.id,
      role: isGlobalAdmin ? WorkspaceRole.ADMIN : (workspace.members[0]?.role ?? WorkspaceRole.USER),
      workspace: {
        id: workspace.id,
        name: workspace.name,
        chatChannels: workspace.chatChannels,
        directConversations: workspace.directConversations
      }
    }));
    const workspaces = [];

    for (const membership of memberships) {
      const permissions = await getRolePermissions(membership.workspaceId, membership.role);

      if (!permissions.canSendMessages) continue;

      workspaces.push({
        id: membership.workspace.id,
        name: membership.workspace.name,
        channels: membership.workspace.chatChannels,
        directConversations: membership.workspace.directConversations.map((conversation) => {
          const person =
            conversation.participantAId === user.id ? conversation.participantB : conversation.participantA;
          return {
            id: conversation.id,
            name: person.name ?? person.email ?? "Workspace member"
          };
        })
      });
    }

    const rooms = (await getAccessibleOrgChatRooms(user.id)).filter((room) => room.canSendMessages);
    return ok({
      workspaces,
      organizationRooms: rooms.map((room) => ({ id: room.id, name: room.name }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
