import { prisma } from "@/lib/prisma";

type NotificationInput = {
  userId: string;
  workspaceId?: string | null;
  type: string;
  title: string;
  body?: string | null;
  href?: string | null;
};

export async function createNotification(input: NotificationInput) {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      workspaceId: input.workspaceId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null
    }
  });
}

export async function notifyUsers(userIds: string[], input: Omit<NotificationInput, "userId">) {
  const uniqueUserIds = Array.from(new Set(userIds.filter(Boolean)));

  if (!uniqueUserIds.length) {
    return;
  }

  await prisma.notification.createMany({
    data: uniqueUserIds.map((userId) => ({
      userId,
      workspaceId: input.workspaceId ?? null,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      href: input.href ?? null
    }))
  });
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
