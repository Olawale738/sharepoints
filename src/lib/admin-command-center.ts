import {
  BackupStatus,
  DocumentExpiryStatus,
  DocumentExpiryTargetType,
  MonthlyReportStatus,
  NotificationDeliveryStatus,
  OfficialLetterStatus,
  WorkspaceRole
} from "@prisma/client";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError } from "@/lib/api";
import { isOnlyOfficeConfigured } from "@/lib/onlyoffice";
import { getApprovalWallPolicy, getEmergencyLockdownState } from "@/lib/president-controls";
import { prisma } from "@/lib/prisma";
import { isRealtimeConfigured } from "@/lib/realtime";

const DAY = 24 * 60 * 60 * 1000;

function isEditableDocument(fileName: string) {
  return /\.(docx?|xlsx?|pptx?|odt|ods|odp|txt|csv)$/i.test(fileName);
}

export async function getSmartPermissionReviewSnapshot() {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * DAY);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * DAY);
  const fourteenDaysFromNow = new Date(now.getTime() + 14 * DAY);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * DAY);

  const [memberships, temporaryAccess, fileGrants, shareLinks, leaders] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspace: { deletedAt: null }, joinedAt: { lt: ninetyDaysAgo } },
      include: {
        workspace: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true, deletedAt: true, suspendedAt: true, accessRevokedAt: true } }
      },
      orderBy: { joinedAt: "asc" },
      take: 300
    }),
    prisma.temporaryWorkspaceAccess.findMany({
      where: {
        revokedAt: null,
        OR: [{ expiresAt: { lt: now } }, { expiresAt: { lte: fourteenDaysFromNow } }]
      },
      include: {
        workspace: { select: { id: true, name: true } },
        user: { select: { id: true, name: true, email: true } }
      },
      orderBy: { expiresAt: "asc" },
      take: 100
    }),
    prisma.fileAccessGrant.findMany({
      where: {
        revokedAt: null,
        OR: [{ expiresAt: { lt: now } }, { expiresAt: { lte: fourteenDaysFromNow } }]
      },
      include: {
        file: { select: { id: true, fileName: true, workspace: { select: { id: true, name: true } } } },
        user: { select: { id: true, name: true, email: true } }
      },
      orderBy: { expiresAt: "asc" },
      take: 100
    }),
    prisma.fileShareLink.findMany({
      where: {
        file: { deletedAt: null, workspace: { deletedAt: null } },
        OR: [{ expiresAt: null }, { expiresAt: { lte: fourteenDaysFromNow } }, { createdAt: { lt: thirtyDaysAgo } }]
      },
      include: {
        file: { select: { id: true, fileName: true, workspace: { select: { id: true, name: true } } } },
        createdBy: { select: { name: true, email: true } }
      },
      orderBy: { createdAt: "asc" },
      take: 100
    }),
    prisma.organizationUnitLeader.findMany({
      select: { id: true, unitId: true, userId: true, title: true },
      orderBy: { createdAt: "asc" },
      take: 300
    })
  ]);

  const candidateUserIds = Array.from(new Set(memberships.map((membership) => membership.userId)));
  const recentActivityUsers = candidateUserIds.length
    ? await prisma.activityLog.findMany({
        where: { userId: { in: candidateUserIds }, createdAt: { gte: ninetyDaysAgo } },
        select: { userId: true },
        distinct: ["userId"]
      })
    : [];
  const activeUserIds = new Set(recentActivityUsers.map((activity) => activity.userId).filter(Boolean));

  const oldUnusedMemberships = memberships
    .filter((membership) => !activeUserIds.has(membership.userId))
    .slice(0, 40)
    .map((membership) => ({
      id: membership.id,
      severity: membership.role === WorkspaceRole.ADMIN ? "HIGH" : membership.role === WorkspaceRole.LEADER ? "MEDIUM" : "LOW",
      kind: "OLD_UNUSED_WORKSPACE_ACCESS",
      title: `${membership.user.name ?? membership.user.email ?? "Member"} has old unused access`,
      detail: `${membership.workspace.name} - ${membership.role.toLowerCase()} - no recorded activity in 90 days.`,
      href: "/dashboard/admin/access-review"
    }));

  const leaderUserIds = Array.from(new Set(leaders.map((leader) => leader.userId)));
  const [profiles, units] = await Promise.all([
    leaderUserIds.length
      ? prisma.memberProfile.findMany({
          where: { userId: { in: leaderUserIds } },
          select: { userId: true, currentOrganizationUnitId: true, organizationPosition: true }
        })
      : Promise.resolve([]),
    leaders.length
      ? prisma.organizationUnit.findMany({
          where: { id: { in: Array.from(new Set(leaders.map((leader) => leader.unitId))) } },
          select: { id: true, name: true, type: true }
        })
      : Promise.resolve([])
  ]);
  const profileByUserId = new Map(profiles.map((profile) => [profile.userId, profile]));
  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const transferredLeaderSuggestions = leaders
    .filter((leader) => {
      const profile = profileByUserId.get(leader.userId);
      return Boolean(profile?.currentOrganizationUnitId && profile.currentOrganizationUnitId !== leader.unitId);
    })
    .slice(0, 30)
    .map((leader) => ({
      id: leader.id,
      severity: "MEDIUM",
      kind: "TRANSFERRED_LEADER_ACCESS",
      title: "Leader assignment may be outdated",
      detail: `${leader.title} is still assigned to ${unitById.get(leader.unitId)?.name ?? "a previous unit"} but the member profile points elsewhere.`,
      href: "/dashboard/admin/global"
    }));

  const expiringAccessSuggestions = [
    ...temporaryAccess.map((access) => ({
      id: access.id,
      severity: access.expiresAt && access.expiresAt < now ? "HIGH" : "MEDIUM",
      kind: "TEMPORARY_WORKSPACE_ACCESS",
      title: access.expiresAt && access.expiresAt < now ? "Expired temporary workspace access" : "Temporary workspace access nearing expiry",
      detail: `${access.user.name ?? access.user.email ?? "Member"} - ${access.workspace.name} - ${access.expiresAt ? access.expiresAt.toISOString().slice(0, 10) : "no expiry"}.`,
      href: "/dashboard/admin/access-review"
    })),
    ...fileGrants.map((grant) => ({
      id: grant.id,
      severity: grant.expiresAt && grant.expiresAt < now ? "HIGH" : "MEDIUM",
      kind: "FILE_ACCESS_GRANT",
      title: grant.expiresAt && grant.expiresAt < now ? "Expired file access grant" : "File access grant nearing expiry",
      detail: `${grant.user.name ?? grant.user.email ?? "Member"} - ${grant.file.fileName} - ${grant.expiresAt ? grant.expiresAt.toISOString().slice(0, 10) : "no expiry"}.`,
      href: "/dashboard/admin/access-review"
    })),
    ...shareLinks.map((link) => ({
      id: link.id,
      severity: link.expiresAt ? "MEDIUM" : "HIGH",
      kind: "SHARE_LINK_REVIEW",
      title: link.expiresAt ? "Share link nearing review" : "Share link has no expiry",
      detail: `${link.file.fileName} - ${link.file.workspace.name} - created by ${link.createdBy.name ?? link.createdBy.email ?? "member"}.`,
      href: "/dashboard/admin/access-review"
    }))
  ].slice(0, 60);

  return {
    generatedAt: now.toISOString(),
    oldUnusedMemberships,
    transferredLeaderSuggestions,
    expiringAccessSuggestions,
    summary: {
      oldUnusedMemberships: oldUnusedMemberships.length,
      transferredLeaders: transferredLeaderSuggestions.length,
      expiringAccess: expiringAccessSuggestions.length,
      highRisk: [...oldUnusedMemberships, ...transferredLeaderSuggestions, ...expiringAccessSuggestions].filter(
        (item) => item.severity === "HIGH"
      ).length,
      inactiveCutoff: sixtyDaysAgo.toISOString()
    }
  };
}

export async function getUnifiedCommandCenterData() {
  const now = new Date();
  const lastWeek = new Date(now.getTime() - 7 * DAY);
  const staleCheckoutAt = new Date(now.getTime() - 12 * 60 * 60 * 1000);

  const [
    pendingApprovals,
    pendingPresidentApprovals,
    failedNotifications,
    pendingSignatures,
    latestBackup,
    failedBackups,
    failedLogins,
    accessDenials,
    openDlpIncidents,
    pendingFiles,
    legalHoldFiles,
    infectedFiles,
    retentionExpiredFiles,
    lifecycleDueItems,
    lifecycleArchivedItems,
    editableFiles,
    checkedOutFiles,
    staleCheckouts,
    workspaces,
    units,
    leaderCounts,
    memberCounts,
    policy,
    lockdown,
    permissionReview
  ] = await Promise.all([
    prisma.approvalRequest.count({ where: { status: "PENDING" } }),
    prisma.presidentialApprovalItem.count({ where: { status: "PENDING" } }),
    prisma.notificationDeliveryEvent.findMany({
      where: {
        status: { in: [NotificationDeliveryStatus.FAILED, NotificationDeliveryStatus.BLOCKED] },
        createdAt: { gte: lastWeek }
      },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 25
    }),
    prisma.digitalSignature.findMany({
      where: { status: "REQUESTED" },
      orderBy: { createdAt: "asc" },
      take: 25
    }),
    prisma.backupSnapshot.findFirst({
      where: { workspaceId: null, status: BackupStatus.COMPLETED },
      orderBy: { createdAt: "desc" }
    }),
    prisma.backupSnapshot.count({ where: { status: BackupStatus.FAILED, createdAt: { gte: lastWeek } } }),
    prisma.securityEvent.count({ where: { type: "LOGIN_FAILED", createdAt: { gte: lastWeek } } }),
    prisma.accessScanLog.count({ where: { decision: "DENIED", createdAt: { gte: lastWeek } } }),
    prisma.dlpIncident.count({ where: { status: "OPEN" } }),
    prisma.file.count({ where: { deletedAt: null, approvalStatus: "PENDING" } }),
    prisma.file.count({ where: { deletedAt: null, legalHold: true } }),
    prisma.file.count({ where: { deletedAt: null, scanStatus: "INFECTED" } }),
    prisma.file.count({ where: { deletedAt: null, retentionUntil: { lt: now } } }),
    prisma.documentExpiryItem.findMany({
      where: {
        status: { in: [DocumentExpiryStatus.ACTIVE, DocumentExpiryStatus.REVIEW_DUE, DocumentExpiryStatus.EXPIRED] },
        OR: [{ reviewDueAt: { lte: now } }, { expiresAt: { lte: now } }]
      },
      orderBy: [{ status: "asc" }, { expiresAt: "asc" }, { reviewDueAt: "asc" }],
      take: 25
    }),
    prisma.documentExpiryItem.count({ where: { status: DocumentExpiryStatus.ARCHIVED } }),
    prisma.file.findMany({ where: { deletedAt: null }, select: { id: true, fileName: true }, take: 5000 }).then((files) =>
      files.filter((file) => isEditableDocument(file.fileName)).length
    ),
    prisma.file.count({ where: { deletedAt: null, checkedOutAt: { not: null } } }),
    prisma.file.findMany({
      where: { deletedAt: null, checkedOutAt: { lt: staleCheckoutAt } },
      select: { id: true, fileName: true, checkedOutAt: true },
      take: 25
    }),
    prisma.workspace.count({ where: { deletedAt: null } }),
    prisma.organizationUnit.findMany({
      where: { active: true, type: { in: ["BRANCH", "CHURCH", "MINISTRY"] } },
      select: { id: true, name: true, type: true, countryCode: true },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      take: 250
    }),
    prisma.organizationUnitLeader.groupBy({ by: ["unitId"], _count: { id: true } }),
    prisma.memberProfile.groupBy({
      by: ["currentOrganizationUnitId"],
      where: { currentOrganizationUnitId: { not: null } },
      _count: { id: true }
    }),
    getApprovalWallPolicy(),
    getEmergencyLockdownState(),
    getSmartPermissionReviewSnapshot()
  ]);

  const leadersByUnit = new Map(leaderCounts.map((row) => [row.unitId, row._count.id]));
  const membersByUnit = new Map(memberCounts.map((row) => [row.currentOrganizationUnitId, row._count.id]));
  const weakBranches = units
    .map((unit) => ({
      id: unit.id,
      name: unit.name,
      type: unit.type,
      countryCode: unit.countryCode,
      leaders: leadersByUnit.get(unit.id) ?? 0,
      members: membersByUnit.get(unit.id) ?? 0
    }))
    .filter((unit) => unit.leaders === 0 || unit.members === 0)
    .slice(0, 25);

  const urgentItems = [
    pendingPresidentApprovals
      ? {
          title: "President approvals waiting",
          count: pendingPresidentApprovals,
          severity: "CRITICAL",
          href: "/dashboard/admin/president-wall"
        }
      : null,
    pendingApprovals
      ? {
          title: "Workspace approvals waiting",
          count: pendingApprovals,
          severity: "HIGH",
          href: "/dashboard/admin/president-desk"
        }
      : null,
    failedNotifications.length
      ? {
          title: "Failed or blocked notifications",
          count: failedNotifications.length,
          severity: "HIGH",
          href: "/dashboard/admin/notifications"
        }
      : null,
    failedBackups
      ? {
          title: "Backup failures this week",
          count: failedBackups,
          severity: "CRITICAL",
          href: "/dashboard/admin/platform-excellence"
        }
      : null,
    pendingSignatures.length
      ? {
          title: "Pending signatures",
          count: pendingSignatures.length,
          severity: "MEDIUM",
          href: "/dashboard/executive-briefing"
        }
      : null,
    permissionReview.summary.highRisk
      ? {
          title: "High-risk permission review items",
          count: permissionReview.summary.highRisk,
          severity: "HIGH",
          href: "/dashboard/admin/access-review"
        }
      : null
  ].filter((item): item is { title: string; count: number; severity: string; href: string } => Boolean(item));

  const documentLifecycle = {
    draftOrUnderReview: pendingFiles,
    approvedActive: await prisma.file.count({ where: { deletedAt: null, approvalStatus: "APPROVED", legalHold: false } }),
    expired: retentionExpiredFiles + lifecycleDueItems.filter((item) => item.status === DocumentExpiryStatus.EXPIRED).length,
    archived: lifecycleArchivedItems,
    legalHold: legalHoldFiles,
    infected: infectedFiles,
    dueItems: lifecycleDueItems.map((item) => ({
      id: item.id,
      title: item.title,
      targetType: item.targetType,
      status: item.status,
      reviewDueAt: item.reviewDueAt?.toISOString() ?? null,
      expiresAt: item.expiresAt?.toISOString() ?? null
    }))
  };

  return {
    generatedAt: now.toISOString(),
    metrics: {
      urgentItems: urgentItems.length,
      failedNotifications: failedNotifications.length,
      weakBranches: weakBranches.length,
      pendingSignatures: pendingSignatures.length,
      failedBackups,
      securityAlerts: failedLogins + accessDenials + openDlpIncidents,
      documentIssues: pendingFiles + retentionExpiredFiles + infectedFiles + lifecycleDueItems.length,
      workspaces
    },
    urgentItems,
    failedNotifications: failedNotifications.map((event) => ({
      id: event.id,
      channel: event.channel,
      status: event.status,
      error: event.error ?? event.blockedReason ?? "Delivery issue",
      userName: event.user.name ?? event.user.email ?? "LETW member",
      createdAt: event.createdAt.toISOString()
    })),
    weakBranches,
    pendingSignatures: pendingSignatures.map((signature) => ({
      id: signature.id,
      title: signature.title,
      signerName: signature.signerName,
      targetType: signature.targetType,
      createdAt: signature.createdAt.toISOString()
    })),
    backupStatus: {
      latestBackupAt: latestBackup?.createdAt.toISOString() ?? null,
      latestBackupName: latestBackup?.name ?? null,
      latestBackupSize: latestBackup?.size ?? 0,
      failedBackups
    },
    security: {
      failedLogins,
      accessDenials,
      openDlpIncidents,
      lockdownActive: lockdown.active,
      lockdownReason: lockdown.reason
    },
    permissionReview,
    documentLifecycle,
    presidentRules: {
      active: policy.active,
      requireOfficialLetters: policy.requireOfficialLetters,
      requireCertificates: policy.requireCertificates,
      requireIdCards: policy.requireIdCards,
      requireLeadershipAppointments: policy.requireLeadershipAppointments,
      requireSensitiveFiles: policy.requireSensitiveFiles,
      requireFinancialApprovals: policy.requireFinancialApprovals,
      pendingPresidentApprovals,
      lockdownActive: lockdown.active
    },
    collaboration: {
      onlyOfficeConfigured: isOnlyOfficeConfigured(),
      realtimeConfigured: isRealtimeConfigured(),
      editableFiles,
      checkedOutFiles,
      staleCheckouts: staleCheckouts.map((file) => ({
        id: file.id,
        fileName: file.fileName,
        checkedOutAt: file.checkedOutAt?.toISOString() ?? null
      }))
    }
  };
}

export async function syncDocumentLifecycleFromFiles(actorId: string) {
  const files = await prisma.file.findMany({
    where: {
      deletedAt: null,
      retentionUntil: { not: null }
    },
    select: { id: true, workspaceId: true, fileName: true, retentionUntil: true, uploadedById: true },
    take: 500
  });
  const existing = files.length
    ? await prisma.documentExpiryItem.findMany({
        where: { targetType: DocumentExpiryTargetType.FILE, targetId: { in: files.map((file) => file.id) } },
        select: { targetId: true }
      })
    : [];
  const existingTargetIds = new Set(existing.map((item) => item.targetId));
  const missing = files.filter((file) => !existingTargetIds.has(file.id));

  for (const file of missing) {
    await prisma.documentExpiryItem.create({
      data: {
        workspaceId: file.workspaceId,
        targetType: DocumentExpiryTargetType.FILE,
        targetId: file.id,
        title: file.fileName,
        ownerId: file.uploadedById,
        reviewDueAt: file.retentionUntil ? new Date(file.retentionUntil.getTime() - 30 * DAY) : null,
        expiresAt: file.retentionUntil,
        status: file.retentionUntil && file.retentionUntil < new Date() ? DocumentExpiryStatus.EXPIRED : DocumentExpiryStatus.ACTIVE,
        notes: "Synced automatically from document retention settings.",
        createdById: actorId
      }
    });
  }

  await logActivity({
    userId: actorId,
    action: activityActions.documentExpiryUpdated,
    metadata: { operation: "SYNC_DOCUMENT_LIFECYCLE", created: missing.length }
  });

  return { created: missing.length, scanned: files.length };
}

export async function cleanupExpiredAccess(actorId: string) {
  const now = new Date();
  const [temporaryAccess, fileGrants, shareLinks] = await Promise.all([
    prisma.temporaryWorkspaceAccess.updateMany({
      where: { revokedAt: null, expiresAt: { lt: now } },
      data: { revokedAt: now }
    }),
    prisma.fileAccessGrant.updateMany({
      where: { revokedAt: null, expiresAt: { lt: now } },
      data: { revokedAt: now }
    }),
    prisma.fileShareLink.deleteMany({
      where: { expiresAt: { lt: now } }
    })
  ]);

  await logActivity({
    userId: actorId,
    action: activityActions.systemCleanupRun,
    metadata: {
      operation: "COMMAND_CENTER_EXPIRED_ACCESS_CLEANUP",
      temporaryAccess: temporaryAccess.count,
      fileGrants: fileGrants.count,
      shareLinks: shareLinks.count
    }
  });

  return {
    temporaryAccess: temporaryAccess.count,
    fileGrants: fileGrants.count,
    shareLinks: shareLinks.count
  };
}

export async function getRecoveryCenterData() {
  const now = new Date();
  const [deletedUsers, certificates, letters, reports] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: { not: null } },
      select: { id: true, name: true, email: true, deletedAt: true, suspendedAt: true, accessRevokedAt: true },
      orderBy: { deletedAt: "desc" },
      take: 100
    }),
    prisma.memberCertificationBadge.findMany({
      where: {
        OR: [{ status: { not: "ACTIVE" } }, { revokedAt: { not: null } }, { expiresAt: { lt: now } }]
      },
      select: { id: true, title: true, certificateNumber: true, status: true, revokedAt: true, expiresAt: true, userId: true },
      orderBy: [{ revokedAt: "desc" }, { updatedAt: "desc" }],
      take: 100
    }),
    prisma.officialLetter.findMany({
      where: { status: { in: [OfficialLetterStatus.REVOKED, OfficialLetterStatus.ARCHIVED, OfficialLetterStatus.DRAFT] } },
      select: { id: true, title: true, letterNumber: true, recipientName: true, status: true, revokedAt: true, issuedAt: true },
      orderBy: [{ updatedAt: "desc" }],
      take: 100
    }),
    prisma.monthlyMinistryReport.findMany({
      where: { status: { in: [MonthlyReportStatus.ARCHIVED, MonthlyReportStatus.DRAFT] } },
      select: { id: true, title: true, status: true, month: true, year: true, createdAt: true },
      orderBy: [{ updatedAt: "desc" }],
      take: 100
    })
  ]);

  return {
    deletedUsers: deletedUsers.map((user) => ({
      ...user,
      deletedAt: user.deletedAt?.toISOString() ?? null,
      suspendedAt: user.suspendedAt?.toISOString() ?? null,
      accessRevokedAt: user.accessRevokedAt?.toISOString() ?? null
    })),
    certificates: certificates.map((certificate) => ({
      ...certificate,
      revokedAt: certificate.revokedAt?.toISOString() ?? null,
      expiresAt: certificate.expiresAt?.toISOString() ?? null
    })),
    letters: letters.map((letter) => ({
      ...letter,
      revokedAt: letter.revokedAt?.toISOString() ?? null,
      issuedAt: letter.issuedAt?.toISOString() ?? null
    })),
    reports: reports.map((report) => ({
      ...report,
      createdAt: report.createdAt.toISOString()
    }))
  };
}

export async function performRecoveryCenterAction(actorId: string, input: { action: string; id: string }) {
  if (input.action === "RESTORE_USER") {
    const user = await prisma.user.update({
      where: { id: input.id },
      data: { deletedAt: null, suspendedAt: null, accessRevokedAt: null, sessionVersion: { increment: 1 } },
      select: { id: true, email: true, name: true }
    });
    await logActivity({ userId: actorId, action: activityActions.userRestored, targetId: user.id, metadata: { source: "recovery_center" } });
    return user;
  }

  if (input.action === "RESTORE_CERTIFICATE") {
    const certificate = await prisma.memberCertificationBadge.update({
      where: { id: input.id },
      data: { status: "ACTIVE", revokedAt: null, expiresAt: null }
    });
    await logActivity({
      userId: actorId,
      action: "certificate.restored",
      targetId: certificate.id,
      metadata: { source: "recovery_center", certificateNumber: certificate.certificateNumber ?? null }
    });
    return certificate;
  }

  if (input.action === "DELETE_CERTIFICATE") {
    const certificate = await prisma.memberCertificationBadge.delete({ where: { id: input.id } });
    await logActivity({ userId: actorId, action: "certificate.deleted", targetId: certificate.id, metadata: { source: "recovery_center" } });
    return certificate;
  }

  if (input.action === "RESTORE_LETTER") {
    const letter = await prisma.officialLetter.update({
      where: { id: input.id },
      data: { status: OfficialLetterStatus.ISSUED, revokedAt: null, issuedAt: new Date() }
    });
    await logActivity({ userId: actorId, action: activityActions.officialLetterUpdated, targetId: letter.id, metadata: { source: "recovery_center", status: letter.status } });
    return letter;
  }

  if (input.action === "DELETE_LETTER") {
    const letter = await prisma.officialLetter.delete({ where: { id: input.id } });
    await logActivity({ userId: actorId, action: activityActions.officialLetterDeleted, targetId: letter.id, metadata: { source: "recovery_center" } });
    return letter;
  }

  if (input.action === "RESTORE_REPORT") {
    const report = await prisma.monthlyMinistryReport.update({
      where: { id: input.id },
      data: { status: MonthlyReportStatus.GENERATED }
    });
    await logActivity({ userId: actorId, action: activityActions.monthlyReportUpdated, targetId: report.id, metadata: { source: "recovery_center", status: report.status } });
    return report;
  }

  if (input.action === "DELETE_REPORT") {
    const report = await prisma.monthlyMinistryReport.delete({ where: { id: input.id } });
    await logActivity({ userId: actorId, action: activityActions.monthlyReportDeleted, targetId: report.id, metadata: { source: "recovery_center" } });
    return report;
  }

  throw new ApiError(422, "Unknown recovery action.");
}
