import { NotificationPriority, WorkspaceRole } from "@prisma/client";

import { activityActions, logActivity } from "@/lib/activity";
import { createWorkspaceBackup } from "@/lib/backups";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { isS3Configured } from "@/lib/storage";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export async function getSystemAdminUserId() {
  const seedAdminEmail = process.env.SEED_ADMIN_EMAIL ?? "president@letw.org";
  const seeded = await prisma.user.findUnique({
    where: { email: seedAdminEmail.toLowerCase() },
    select: { id: true, deletedAt: true, suspendedAt: true, accessRevokedAt: true }
  });
  if (seeded && !seeded.deletedAt && !seeded.suspendedAt && !seeded.accessRevokedAt) return seeded.id;

  const membership = await prisma.workspaceMember.findFirst({
    where: {
      role: WorkspaceRole.ADMIN,
      user: {
        deletedAt: null,
        suspendedAt: null,
        accessRevokedAt: null
      }
    },
    select: { userId: true },
    orderBy: { joinedAt: "asc" }
  });
  return membership?.userId ?? null;
}

export async function getActiveAdminUserIds() {
  const admins = await prisma.workspaceMember.findMany({
    where: {
      role: WorkspaceRole.ADMIN,
      user: {
        deletedAt: null,
        suspendedAt: null,
        accessRevokedAt: null
      }
    },
    select: { userId: true }
  });
  return Array.from(new Set(admins.map((admin) => admin.userId)));
}

export async function createAutomaticOrganizationBackup(force = false) {
  const adminId = await getSystemAdminUserId();
  if (!adminId) {
    throw new Error("No active administrator account is available for automatic backups.");
  }

  const recentBackup = await prisma.backupSnapshot.findFirst({
    where: {
      workspaceId: null,
      status: "COMPLETED",
      createdAt: { gte: new Date(Date.now() - 20 * HOUR) }
    },
    orderBy: { createdAt: "desc" }
  });
  if (recentBackup && !force) {
    return { backup: recentBackup, skipped: true };
  }

  const backup = await createWorkspaceBackup(null, adminId, `Automatic LETW backup ${new Date().toISOString().slice(0, 10)}`);
  await logActivity({
    userId: adminId,
    action: activityActions.automaticBackupCreated,
    targetId: backup.id,
    metadata: {
      status: backup.status,
      size: backup.size ?? 0,
      checksum: backup.checksum ?? null
    }
  });
  return { backup, skipped: false };
}

export async function collectSystemMonitorSnapshot() {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  const thirtySixHoursAgo = new Date(Date.now() - 36 * HOUR);
  const twentyFourHoursAgo = new Date(Date.now() - DAY);

  const [
    users,
    suspendedUsers,
    revokedUsers,
    workspaces,
    files,
    pendingInvitations,
    recentFailedLogins,
    lastCompletedBackup,
    recentFailedBackups,
    recentAccessDenials
  ] = await Promise.all([
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null, suspendedAt: { not: null } } }),
    prisma.user.count({ where: { deletedAt: null, accessRevokedAt: { not: null } } }),
    prisma.workspace.count({ where: { deletedAt: null } }),
    prisma.file.count({ where: { deletedAt: null } }),
    prisma.companyEmailInvitation.count({ where: { acceptedAt: null, revokedAt: null } }),
    prisma.securityEvent.count({
      where: {
        type: "LOGIN_FAILED",
        createdAt: { gte: fifteenMinutesAgo }
      }
    }),
    prisma.backupSnapshot.findFirst({
      where: { workspaceId: null, status: "COMPLETED" },
      orderBy: { createdAt: "desc" }
    }),
    prisma.backupSnapshot.count({
      where: {
        status: "FAILED",
        createdAt: { gte: twentyFourHoursAgo }
      }
    }),
    prisma.accessScanLog.count({
      where: {
        decision: "DENIED",
        createdAt: { gte: fifteenMinutesAgo }
      }
    })
  ]);

  const warnings = [
    !isS3Configured() ? "Cloud object storage is not configured." : null,
    recentFailedLogins >= 10 ? `${recentFailedLogins} failed logins occurred in the last 15 minutes.` : null,
    recentAccessDenials >= 25 ? `${recentAccessDenials} access scans were denied in the last 15 minutes.` : null,
    !lastCompletedBackup ? "No completed organization backup exists yet." : null,
    lastCompletedBackup && lastCompletedBackup.createdAt < thirtySixHoursAgo
      ? `Last completed organization backup is older than 36 hours: ${lastCompletedBackup.createdAt.toISOString()}.`
      : null,
    recentFailedBackups > 0 ? `${recentFailedBackups} backup failure(s) occurred in the last 24 hours.` : null
  ].filter((warning): warning is string => Boolean(warning));

  return {
    status: warnings.length ? "warning" : "healthy",
    metrics: {
      users,
      suspendedUsers,
      revokedUsers,
      workspaces,
      files,
      pendingInvitations,
      recentFailedLogins,
      recentAccessDenials,
      recentFailedBackups,
      lastCompletedBackupAt: lastCompletedBackup?.createdAt.toISOString() ?? null
    },
    warnings,
    checkedAt: new Date().toISOString()
  };
}

export async function notifyAdminsOfMonitorWarnings(warnings: string[]) {
  if (!warnings.length) return { notified: 0 };
  const recent = await prisma.notification.count({
    where: {
      type: "SYSTEM_MONITOR",
      createdAt: { gte: new Date(Date.now() - 4 * HOUR) }
    }
  });
  if (recent > 0) return { notified: 0 };

  const adminIds = await getActiveAdminUserIds();
  await notifyUsers(adminIds, {
    type: "SYSTEM_MONITOR",
    title: "LETW system monitor needs attention",
    body: warnings.slice(0, 5).join(" "),
    href: "/dashboard/admin/enterprise",
    priority: NotificationPriority.URGENT
  });

  const actorId = await getSystemAdminUserId();
  await logActivity({
    userId: actorId ?? undefined,
    action: activityActions.monitorWarningRaised,
    metadata: { warnings }
  });

  return { notified: adminIds.length };
}
