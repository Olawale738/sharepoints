import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceAdminAccess } from "@/lib/rbac";

type RouteContext = {
  params: Promise<{ channelId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { channelId } = await context.params;

    const channel = await prisma.chatChannel.findUnique({
      where: { id: channelId },
      select: {
        id: true,
        name: true,
        workspaceId: true
      }
    });

    if (!channel) {
      throw new ApiError(404, "Channel not found.");
    }

    await requireWorkspaceAdminAccess(user.id, channel.workspaceId, "Only admins can delete channels.");

    const channelCount = await prisma.chatChannel.count({
      where: {
        workspaceId: channel.workspaceId
      }
    });

    if (channelCount <= 1) {
      throw new ApiError(409, "A workspace must keep at least one channel.");
    }

    await prisma.chatChannel.delete({
      where: {
        id: channel.id
      }
    });

    await logActivity({
      userId: user.id,
      workspaceId: channel.workspaceId,
      action: activityActions.channelDeleted,
      targetId: channel.id,
      metadata: {
        name: channel.name
      }
    });

    return ok({
      deletedChannelId: channel.id
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
