import { OrgChatAudience, WorkspaceRole } from "@prisma/client";

import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getRolePermissions } from "@/lib/rbac";

export const orgChatRoomDefinitions = [
  {
    audience: OrgChatAudience.ALL,
    name: "All members",
    description: "Open to everyone with at least one workspace membership."
  },
  {
    audience: OrgChatAudience.ADMIN,
    name: "Admins",
    description: "Cross-workspace room for administrators."
  },
  {
    audience: OrgChatAudience.LEADER,
    name: "Leaders",
    description: "Cross-workspace room for leaders."
  },
  {
    audience: OrgChatAudience.MODERATOR,
    name: "Moderators",
    description: "Cross-workspace room for moderators."
  },
  {
    audience: OrgChatAudience.USER,
    name: "Users",
    description: "Cross-workspace room for ordinary users."
  }
] as const;

const allAudiences = orgChatRoomDefinitions.map((room) => room.audience);

type MembershipForOrgChat = {
  role: WorkspaceRole;
  workspaceId: string;
};

function roleAudience(role: WorkspaceRole) {
  if (role === WorkspaceRole.ADMIN) {
    return OrgChatAudience.ADMIN;
  }

  if (role === WorkspaceRole.LEADER || role === WorkspaceRole.EDITOR) {
    return OrgChatAudience.LEADER;
  }

  if (role === WorkspaceRole.MODERATOR) {
    return OrgChatAudience.MODERATOR;
  }

  return OrgChatAudience.USER;
}

export async function ensureOrgChatRooms(createdById?: string) {
  await Promise.all(
    orgChatRoomDefinitions.map((room) =>
      prisma.orgChatRoom.upsert({
        where: {
          audience: room.audience
        },
        update: {
          name: room.name,
          description: room.description
        },
        create: {
          audience: room.audience,
          name: room.name,
          description: room.description,
          createdById
        }
      })
    )
  );
}

async function getMemberships(userId: string) {
  return prisma.workspaceMember.findMany({
    where: {
      userId
    },
    select: {
      role: true,
      workspaceId: true
    }
  });
}

async function canSendForMembership(membership: MembershipForOrgChat) {
  const permissions = await getRolePermissions(membership.workspaceId, membership.role);

  return permissions.canSendMessages;
}

export async function getUserOrgChatAudiences(userId: string) {
  const memberships = await getMemberships(userId);
  const readable = new Set<OrgChatAudience>();
  const sendable = new Set<OrgChatAudience>();

  if (memberships.length) {
    readable.add(OrgChatAudience.ALL);
  }

  await Promise.all(
    memberships.map(async (membership) => {
      if (membership.role === WorkspaceRole.ADMIN) {
        allAudiences.forEach((audience) => readable.add(audience));
      } else {
        readable.add(roleAudience(membership.role));
      }

      if (await canSendForMembership(membership)) {
        sendable.add(OrgChatAudience.ALL);

        if (membership.role === WorkspaceRole.ADMIN) {
          allAudiences.forEach((audience) => sendable.add(audience));
        } else {
          sendable.add(roleAudience(membership.role));
        }
      }
    })
  );

  return {
    readable: Array.from(readable),
    sendable: Array.from(sendable)
  };
}

export async function requireOrgChatRoomAccess(userId: string, roomId: string) {
  await ensureOrgChatRooms(userId);

  const room = await prisma.orgChatRoom.findUnique({
    where: {
      id: roomId
    }
  });

  if (!room) {
    throw new ApiError(404, "Organization chat room not found.");
  }

  const { readable } = await getUserOrgChatAudiences(userId);

  if (!readable.includes(room.audience)) {
    throw new ApiError(403, "You cannot access this organization chat room.");
  }

  return room;
}

export async function requireOrgChatRoomSendAccess(userId: string, roomId: string) {
  const room = await requireOrgChatRoomAccess(userId, roomId);
  const { sendable } = await getUserOrgChatAudiences(userId);

  if (!sendable.includes(room.audience)) {
    throw new ApiError(403, "Your role cannot send messages in this organization chat room.");
  }

  return room;
}

export function audienceRoles(audience: OrgChatAudience) {
  if (audience === OrgChatAudience.ADMIN) {
    return [WorkspaceRole.ADMIN];
  }

  if (audience === OrgChatAudience.LEADER) {
    return [WorkspaceRole.LEADER, WorkspaceRole.EDITOR];
  }

  if (audience === OrgChatAudience.MODERATOR) {
    return [WorkspaceRole.MODERATOR];
  }

  if (audience === OrgChatAudience.USER) {
    return [WorkspaceRole.USER, WorkspaceRole.VIEWER];
  }

  return [
    WorkspaceRole.ADMIN,
    WorkspaceRole.LEADER,
    WorkspaceRole.MODERATOR,
    WorkspaceRole.USER,
    WorkspaceRole.EDITOR,
    WorkspaceRole.VIEWER
  ];
}

export async function getOrgChatAudienceCounts() {
  const entries = await Promise.all(
    allAudiences.map(async (audience) => {
      const members = await prisma.workspaceMember.findMany({
        where: {
          role: {
            in: audienceRoles(audience)
          }
        },
        distinct: ["userId"],
        select: {
          userId: true
        }
      });

      return [audience, members.length] as const;
    })
  );

  return new Map(entries);
}
