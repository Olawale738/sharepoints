import { WorkspaceRole } from "@prisma/client";

import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const operationsManagerRoles = [
  WorkspaceRole.ADMIN,
  WorkspaceRole.LEADER,
  WorkspaceRole.EDITOR,
  WorkspaceRole.MODERATOR
];

export async function isOperationsManager(userId: string) {
  return Boolean(
    await prisma.workspaceMember.findFirst({
      where: {
        userId,
        role: { in: operationsManagerRoles },
        workspace: { deletedAt: null }
      },
      select: { id: true }
    })
  );
}

export async function requireOperationsManager(
  userId: string,
  message = "Only admins, leaders, and moderators can manage this area."
) {
  if (!(await isOperationsManager(userId))) {
    throw new ApiError(403, message);
  }
}

export async function activeOrganizationUsers() {
  return prisma.user.findMany({
    where: {
      deletedAt: null,
      suspendedAt: null,
      accessRevokedAt: null
    },
    select: {
      id: true,
      name: true,
      email: true,
      departmentId: true,
      category: true
    },
    orderBy: [{ name: "asc" }, { email: "asc" }]
  });
}

export function responseDueAt(priority: "LOW" | "NORMAL" | "HIGH" | "URGENT") {
  const hours = priority === "URGENT" ? 2 : priority === "HIGH" ? 8 : priority === "NORMAL" ? 24 : 72;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}

export function randomTicketCode(prefix: string) {
  return `${prefix}-${crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
}
