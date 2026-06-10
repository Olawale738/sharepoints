import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceDepartmentChatAccess, requireWorkspaceMembership, requireWorkspacePermission } from "@/lib/rbac";

export async function getWorkspaceChannel(channelId: string) {
  const channel = await prisma.chatChannel.findUnique({
    where: {
      id: channelId
    },
    select: {
      id: true,
      workspaceId: true
    }
  });

  if (!channel) {
    throw new ApiError(404, "Channel not found.");
  }

  return channel;
}

export async function requireWorkspaceChannelMembership(userId: string, channelId: string) {
  const channel = await getWorkspaceChannel(channelId);
  await requireWorkspaceMembership(userId, channel.workspaceId);
  await requireWorkspaceDepartmentChatAccess(userId, channel.workspaceId);

  return channel;
}

export async function requireWorkspaceChannelSendAccess(userId: string, channelId: string) {
  const channel = await getWorkspaceChannel(channelId);
  await requireWorkspacePermission(userId, channel.workspaceId, "canSendMessages");
  await requireWorkspaceDepartmentChatAccess(userId, channel.workspaceId);

  return channel;
}
