import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type ActivityInput = {
  userId?: string;
  workspaceId?: string;
  action: string;
  targetId?: string;
  metadata?: Prisma.InputJsonObject;
};

export async function logActivity(input: ActivityInput) {
  return prisma.activityLog.create({
    data: {
      userId: input.userId,
      workspaceId: input.workspaceId,
      action: input.action,
      targetId: input.targetId,
      metadata: input.metadata
    }
  });
}

export const activityActions = {
  workspaceCreated: "workspace.created",
  workspaceDeleted: "workspace.deleted",
  userJoinedWorkspace: "workspace.user_joined",
  folderCreated: "folder.created",
  fileUploaded: "file.uploaded",
  fileDeleted: "file.deleted",
  memberUpdated: "workspace.member_updated",
  memberRemoved: "workspace.member_removed",
  rolePermissionsUpdated: "workspace.role_permissions_updated",
  channelCreated: "chat.channel_created",
  messageCreated: "chat.message_created",
  directMessageCreated: "chat.direct_message_created",
  orgChatMessageCreated: "chat.org_message_created",
  integrationCreated: "integration.created",
  integrationDeleted: "integration.deleted",
  webhookReceived: "integration.webhook_received",
  announcementCreated: "announcement.created",
  taskCreated: "task.created",
  taskUpdated: "task.updated",
  taskDeleted: "task.deleted",
  fileShareLinkCreated: "file.share_link_created",
  passwordResetRequested: "auth.password_reset_requested",
  passwordResetCompleted: "auth.password_reset_completed",
  userSuspended: "user.suspended",
  userRestored: "user.restored",
  userAccessRevoked: "user.access_revoked",
  userDeleted: "user.deleted"
} as const;
