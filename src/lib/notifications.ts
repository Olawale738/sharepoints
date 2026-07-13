import { prisma } from "@/lib/prisma";
import { NotificationDeliveryChannel, NotificationDeliveryStatus, NotificationPriority } from "@prisma/client";
import { publishRealtime } from "@/lib/realtime";
import { recordNotificationDeliveryEvents, recordNotificationDeliveryEvent } from "@/lib/notification-delivery-events";

type NotificationInput = {
  userId: string;
  workspaceId?: string | null;
  type: string;
  title: string;
  body?: string | null;
  href?: string | null;
  priority?: NotificationPriority;
  deliverAt?: Date | null;
};

export async function createNotification(input: NotificationInput) {
  const notification = await prisma.notification.create({
    data: {
      userId: input.userId,
      workspaceId: input.workspaceId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null,
      priority: input.priority ?? NotificationPriority.NORMAL,
      deliverAt: input.deliverAt ?? null
    }
  });
  await recordNotificationDeliveryEvent({
    notificationId: notification.id,
    userId: input.userId,
    channel: NotificationDeliveryChannel.IN_APP,
    status: NotificationDeliveryStatus.DELIVERED,
    provider: "LETW_APP",
    deliveredAt: new Date()
  });
  await publishRealtime("notifications", input.userId, "notification.created", notification);
  return notification;
}

export async function notifyUsers(userIds: string[], input: Omit<NotificationInput, "userId">) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));

  if (!uniqueUserIds.length) {
    return;
  }

  const notifications = await prisma.$transaction(
    uniqueUserIds.map((userId) =>
      prisma.notification.create({
        data: {
          userId,
          workspaceId: input.workspaceId ?? null,
          type: input.type,
          title: input.title,
          body: input.body ?? null,
          href: input.href ?? null,
          priority: input.priority ?? NotificationPriority.NORMAL,
          deliverAt: input.deliverAt ?? null
        }
      })
    )
  );
  await recordNotificationDeliveryEvents(
    notifications.map((notification) => ({
      notificationId: notification.id,
      userId: notification.userId,
      channel: NotificationDeliveryChannel.IN_APP,
      status: NotificationDeliveryStatus.DELIVERED,
      provider: "LETW_APP",
      deliveredAt: new Date()
    }))
  );
  await Promise.all(
    uniqueUserIds.map((userId) =>
      publishRealtime("notifications", userId, "notification.refresh", { userId })
    )
  );
  return notifications;
}

export async function notifyWorkspaceMembers(
  workspaceId: string,
  input: Omit<NotificationInput, "userId" | "workspaceId">,
  excludeUserId?: string
) {
  const members = await prisma.workspaceMember.findMany({
    where: {
      workspaceId,
      ...(excludeUserId ? { userId: { not: excludeUserId } } : {})
    },
    select: {
      userId: true
    }
  });

  return notifyUsers(
    members.map((member) => member.userId),
    { ...input, workspaceId }
  );
}

export async function notifyMentionedUsers(input: {
  text: string;
  workspaceId?: string | null;
  actorId: string;
  title: string;
  href: string;
}) {
  const emails = Array.from(
    new Set(
      Array.from(input.text.matchAll(/@([a-z0-9._%+-]+@letw\.org)/gi)).map((match) => match[1].toLowerCase())
    )
  );

  if (!emails.length) {
    return;
  }

  const users = await prisma.user.findMany({
    where: {
      email: { in: emails },
      id: { not: input.actorId },
      deletedAt: null,
      suspendedAt: null,
      accessRevokedAt: null
    },
    select: {
      id: true
    }
  });

  await notifyUsers(
    users.map((user) => user.id),
    {
      workspaceId: input.workspaceId,
      type: "MENTION",
      title: input.title,
      body: input.text.slice(0, 240),
      href: input.href
    }
  );
}
