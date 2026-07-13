import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { Prisma, SecurityEventType, WorkspaceRole } from "@prisma/client";

import { ApiError } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { logSecurityEvent } from "@/lib/security";

const DEFAULT_PROTECTED_ADMIN_EMAIL = "president@letw.org";

export function normalizeProtectedEmail(email: string) {
  return email.trim().toLowerCase();
}

export function protectedAdminEmails() {
  const configured = [
    process.env.SUPER_ADMIN_EMAIL,
    process.env.PRESIDENT_ADMIN_EMAIL,
    process.env.BACKUP_ADMIN_EMAILS
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(","))
    .map(normalizeProtectedEmail)
    .filter(Boolean);

  return Array.from(new Set([DEFAULT_PROTECTED_ADMIN_EMAIL, ...configured]));
}

export function isProtectedAdminEmail(email: string | null | undefined) {
  if (!email) return false;
  return protectedAdminEmails().includes(normalizeProtectedEmail(email));
}

export function isProtectedAdminUser(user: { email?: string | null }) {
  return isProtectedAdminEmail(user.email);
}

export function superAdminRecoveryConfigured() {
  return Boolean(process.env.SUPER_ADMIN_RECOVERY_CODE_HASH || process.env.SUPER_ADMIN_RECOVERY_CODE);
}

function hashRecoveryCode(code: string) {
  return createHash("sha256").update(code.trim(), "utf8").digest("hex");
}

function safeCompareHex(left: string, right: string) {
  try {
    const leftBuffer = Buffer.from(left, "hex");
    const rightBuffer = Buffer.from(right, "hex");
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  } catch {
    return false;
  }
}

export function verifySuperAdminRecoveryCode(code: string) {
  const recoveryCode = code.trim();
  if (!recoveryCode || !superAdminRecoveryConfigured()) return false;

  const configuredHash = process.env.SUPER_ADMIN_RECOVERY_CODE_HASH?.trim();
  if (configuredHash) {
    return safeCompareHex(hashRecoveryCode(recoveryCode), configuredHash);
  }

  const configuredPlainCode = process.env.SUPER_ADMIN_RECOVERY_CODE?.trim();
  return Boolean(configuredPlainCode && configuredPlainCode === recoveryCode);
}

export async function getProtectedAdminStatuses() {
  const emails = protectedAdminEmails();
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: {
      id: true,
      name: true,
      email: true,
      suspendedAt: true,
      accessRevokedAt: true,
      deletedAt: true,
      forcePasswordReset: true,
      updatedAt: true
    }
  });

  return emails.map((email) => {
    const user = users.find((item) => item.email && normalizeProtectedEmail(item.email) === email);
    return {
      email,
      exists: Boolean(user),
      user,
      protected: true
    };
  });
}

export async function restoreProtectedAdminAccount(email: string, actorId?: string) {
  const normalizedEmail = normalizeProtectedEmail(email);
  if (!isProtectedAdminEmail(normalizedEmail)) {
    throw new ApiError(403, "This email is not configured as a protected administrator.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const existingUser = await tx.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        name: true,
        email: true,
        emailVerified: true
      }
    });

    if (!existingUser) {
      throw new ApiError(404, "Protected administrator account was not found. Create or seed it first.");
    }

    const restoredUser = await tx.user.update({
      where: { id: existingUser.id },
      data: {
        suspendedAt: null,
        accessRevokedAt: null,
        deletedAt: null,
        emailVerified: existingUser.emailVerified ?? new Date(),
        forcePasswordReset: true,
        sessionVersion: { increment: 1 }
      },
      select: {
        id: true,
        name: true,
        email: true,
        forcePasswordReset: true
      }
    });

    await tx.session.deleteMany({ where: { userId: restoredUser.id } });
    await tx.companyEmailInvitation.upsert({
      where: { email: normalizedEmail },
      create: {
        email: normalizedEmail,
        invitedById: actorId ?? restoredUser.id,
        acceptedAt: new Date(),
        acceptedById: restoredUser.id
      },
      update: {
        revokedAt: null,
        acceptedAt: new Date(),
        acceptedById: restoredUser.id
      }
    });

    const workspace =
      (await tx.workspace.findFirst({
        where: { deletedAt: null },
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true }
      })) ??
      (await tx.workspace.create({
        data: {
          name: "LETW Recovery Workspace",
          slug: `letw-recovery-${randomBytes(5).toString("hex")}`,
          description: "Emergency protected administrator recovery workspace.",
          createdById: restoredUser.id
        },
        select: { id: true, name: true }
      }));

    await tx.workspaceMember.upsert({
      where: {
        userId_workspaceId: {
          userId: restoredUser.id,
          workspaceId: workspace.id
        }
      },
      create: {
        userId: restoredUser.id,
        workspaceId: workspace.id,
        role: WorkspaceRole.ADMIN
      },
      update: {
        role: WorkspaceRole.ADMIN
      }
    });

    return { restoredUser, workspace };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted
  });

  await logSecurityEvent({
    userId: result.restoredUser.id,
    type: SecurityEventType.USER_RESTORED,
    email: result.restoredUser.email,
    metadata: {
      protectedAdmin: true,
      actorId: actorId ?? null,
      workspaceId: result.workspace.id
    }
  });

  await logActivity({
    userId: actorId ?? result.restoredUser.id,
    action: "super_admin.recovered",
    targetId: result.restoredUser.id,
    workspaceId: result.workspace.id,
    metadata: {
      protectedEmail: result.restoredUser.email,
      recoveryWorkspaceId: result.workspace.id
    }
  });

  return result;
}
