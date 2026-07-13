import { WorkspaceRole } from "@prisma/client";

import { ApiError } from "@/lib/errors";
import { prisma } from "@/lib/prisma";
import { isProtectedAdminEmail } from "@/lib/protected-admin";

export function userAccessStatus(user: {
  suspendedAt?: Date | null;
  accessRevokedAt?: Date | null;
  deletedAt?: Date | null;
}) {
  if (user.deletedAt) {
    return "DELETED";
  }

  if (user.accessRevokedAt) {
    return "REVOKED";
  }

  if (user.suspendedAt) {
    return "SUSPENDED";
  }

  return "ACTIVE";
}

export async function isUserAccessBlocked(input: { userId?: string | null; email?: string | null }) {
  if (!input.userId && !input.email) {
    return true;
  }

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        input.userId ? { id: input.userId } : undefined,
        input.email ? { email: input.email.toLowerCase() } : undefined
      ].filter(Boolean) as Array<{ id: string } | { email: string }>
    },
    select: {
      suspendedAt: true,
      accessRevokedAt: true,
      deletedAt: true
    }
  });

  return !user || userAccessStatus(user) !== "ACTIVE";
}

export async function requireCanManageUser(
  actorId: string,
  targetUserId: string,
  action: "SUSPEND" | "RESTORE" | "REVOKE" | "DELETE"
) {
  if (actorId === targetUserId) {
    throw new ApiError(409, "Admins cannot suspend, revoke, or delete their own account.");
  }

  const [actorAdminMembership, targetAdminMemberships, activeAdminUsers, targetUser] = await Promise.all([
    prisma.workspaceMember.findFirst({
      where: {
        userId: actorId,
        role: WorkspaceRole.ADMIN
      },
      select: {
        id: true
      }
    }),
    prisma.workspaceMember.findMany({
      where: {
        userId: targetUserId,
        role: WorkspaceRole.ADMIN
      },
      select: {
        id: true
      }
    }),
    prisma.workspaceMember.findMany({
      where: {
        role: WorkspaceRole.ADMIN,
        user: {
          suspendedAt: null,
          accessRevokedAt: null,
          deletedAt: null
        }
      },
      distinct: ["userId"],
      select: {
        userId: true
      }
    }),
    prisma.user.findUnique({
      where: {
        id: targetUserId
      },
      select: {
        email: true,
        suspendedAt: true,
        accessRevokedAt: true,
        deletedAt: true
      }
    })
  ]);

  if (!actorAdminMembership) {
    throw new ApiError(403, "Only admins can manage users.");
  }

  if (action === "REVOKE" && targetAdminMemberships.length > 0) {
    throw new ApiError(409, "Admin accounts cannot be revoked. Remove admin roles before revoking access.");
  }

  const isTargetActive = targetUser ? userAccessStatus(targetUser) === "ACTIVE" : false;
  const destructiveAdminAction = action === "SUSPEND" || action === "REVOKE" || action === "DELETE";

  if (destructiveAdminAction && isProtectedAdminEmail(targetUser?.email)) {
    throw new ApiError(409, "This protected administrator cannot be suspended, revoked, or deleted.");
  }

  if (destructiveAdminAction && isTargetActive && targetAdminMemberships.length > 0 && activeAdminUsers.length <= 1) {
    throw new ApiError(409, "You must keep at least one active admin account.");
  }
}

export async function revokeUserSessions(userId: string) {
  await prisma.$transaction([
    prisma.session.deleteMany({
      where: { userId }
    }),
    prisma.account.deleteMany({
      where: { userId }
    }),
    prisma.passwordResetToken.deleteMany({
      where: { userId }
    })
  ]);
}

export async function revokeCompanyInvitationForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true }
  });

  if (!user?.email) {
    return;
  }

  await prisma.companyEmailInvitation.updateMany({
    where: {
      email: user.email.toLowerCase()
    },
    data: {
      revokedAt: new Date()
    }
  });
}

export async function restoreCompanyInvitationForUser(userId: string, actorId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true }
  });

  if (!user?.email) {
    return;
  }

  await prisma.companyEmailInvitation.upsert({
    where: {
      email: user.email.toLowerCase()
    },
    update: {
      invitedById: actorId,
      revokedAt: null
    },
    create: {
      email: user.email.toLowerCase(),
      invitedById: actorId,
      acceptedById: userId,
      acceptedAt: new Date()
    }
  });
}
