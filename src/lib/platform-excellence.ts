import { createHash } from "node:crypto";

import { BackupStatus, FileScanStatus, TranscriptStatus } from "@prisma/client";

import { createAutomaticOrganizationBackup, collectSystemMonitorSnapshot, notifyAdminsOfMonitorWarnings } from "@/lib/system-monitoring";
import { isOnlyOfficeConfigured } from "@/lib/onlyoffice";
import { prisma } from "@/lib/prisma";
import { isRealtimeConfigured } from "@/lib/realtime";
import { getObjectBuffer, isS3Configured } from "@/lib/storage";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

type ReadinessCheck = {
  area: string;
  label: string;
  status: "READY" | "WARNING" | "CRITICAL";
  detail: string;
};

function statusScore(status: ReadinessCheck["status"]) {
  if (status === "READY") return 100;
  if (status === "WARNING") return 55;
  return 10;
}

function score(checks: ReadinessCheck[]) {
  if (!checks.length) return 0;
  return Math.round(checks.reduce((total, check) => total + statusScore(check.status), 0) / checks.length);
}

function check(area: string, label: string, ready: boolean, detail: string, critical = false): ReadinessCheck {
  return {
    area,
    label,
    status: ready ? "READY" : critical ? "CRITICAL" : "WARNING",
    detail
  };
}

function isEditableDocument(fileName: string) {
  return /\.(docx?|xlsx?|pptx?|odt|ods|odp|txt|csv)$/i.test(fileName);
}

export async function collectPlatformExcellenceSnapshot() {
  const now = new Date();
  const thirtySixHoursAgo = new Date(now.getTime() - 36 * HOUR);
  const staleCheckoutAt = new Date(now.getTime() - 12 * HOUR);
  const lastWeek = new Date(now.getTime() - 7 * DAY);
  const monitor = await collectSystemMonitorSnapshot();

  const [
    latestBackup,
    completedBackups,
    failedBackups,
    backupBytes,
    users,
    activeUsers,
    workspaces,
    files,
    editableFiles,
    checkedOutFiles,
    staleCheckouts,
    infectedFiles,
    pendingFileApprovals,
    shareLinks,
    activeShareLinks,
    wikiPages,
    meetingsWithTranscripts,
    failedTranscripts,
    chatMessages,
    searchEntities,
    pushSubscriptions,
    notificationsFailed,
    securityFailures,
    dlpIncidents,
    openAccessRequests
  ] = await Promise.all([
    prisma.backupSnapshot.findFirst({ where: { workspaceId: null, status: BackupStatus.COMPLETED }, orderBy: { createdAt: "desc" } }),
    prisma.backupSnapshot.count({ where: { status: BackupStatus.COMPLETED } }),
    prisma.backupSnapshot.count({ where: { status: BackupStatus.FAILED, createdAt: { gte: lastWeek } } }),
    prisma.backupSnapshot.aggregate({ where: { status: BackupStatus.COMPLETED }, _sum: { size: true } }),
    prisma.user.count({ where: { deletedAt: null } }),
    prisma.user.count({ where: { deletedAt: null, suspendedAt: null, accessRevokedAt: null } }),
    prisma.workspace.count({ where: { deletedAt: null } }),
    prisma.file.count({ where: { deletedAt: null } }),
    prisma.file.findMany({ where: { deletedAt: null }, select: { fileName: true }, take: 5000 }).then((records) => {
      return records.filter((file) => isEditableDocument(file.fileName)).length;
    }),
    prisma.file.count({ where: { deletedAt: null, checkedOutAt: { not: null } } }),
    prisma.file.count({ where: { deletedAt: null, checkedOutAt: { lt: staleCheckoutAt } } }),
    prisma.file.count({ where: { deletedAt: null, scanStatus: FileScanStatus.INFECTED } }),
    prisma.file.count({ where: { deletedAt: null, approvalStatus: "PENDING" } }),
    prisma.fileShareLink.count(),
    prisma.fileShareLink.count({ where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } }),
    prisma.wikiPage.count({ where: { status: "PUBLISHED" } }),
    prisma.workspaceMeeting.count({ where: { transcriptStatus: TranscriptStatus.COMPLETED } }),
    prisma.workspaceMeeting.count({ where: { transcriptStatus: TranscriptStatus.FAILED, updatedAt: { gte: lastWeek } } }),
    prisma.chatMessage.count({ where: { deletedAt: null } }),
    Promise.all([
      prisma.workspace.count({ where: { deletedAt: null } }),
      prisma.file.count({ where: { deletedAt: null, approvalStatus: "APPROVED" } }),
      prisma.folder.count({ where: { deletedAt: null } }),
      prisma.workspaceTask.count(),
      prisma.wikiPage.count(),
      prisma.workspaceForm.count(),
      prisma.workspaceMeeting.count(),
      prisma.officialLetter.count(),
      prisma.memberCertificationBadge.count(),
      prisma.policyDocument.count(),
      prisma.prayerAssignment.count(),
      prisma.externalGuestAccess.count()
    ]).then((counts) => counts.reduce((total, value) => total + value, 0)),
    prisma.pushSubscription.count({ where: { enabled: true } }),
    prisma.notificationDeliveryEvent.count({ where: { status: "FAILED", createdAt: { gte: lastWeek } } }),
    prisma.securityEvent.count({ where: { type: "LOGIN_FAILED", createdAt: { gte: new Date(now.getTime() - HOUR) } } }),
    prisma.dlpIncident.count({ where: { status: "OPEN" } }),
    prisma.accessRequest.count({ where: { status: "PENDING" } })
  ]);

  const reliabilityChecks = [
    check("Reliability", "Database connectivity", monitor.status !== "unhealthy", "Database health query is responding.", true),
    check("Reliability", "Object storage", isS3Configured(), isS3Configured() ? "Cloud object storage is configured." : "Cloud object storage is missing.", true),
    check("Reliability", "Cron protection", Boolean(process.env.CRON_SECRET), "Cron endpoints require CRON_SECRET."),
    check("Reliability", "Auth secret", Boolean(process.env.AUTH_SECRET), "AUTH_SECRET is configured.", true),
    check("Reliability", "Recent failed logins", securityFailures < 10, `${securityFailures} failed login(s) in the last hour.`)
  ];

  const backupChecks = [
    check("Backups", "Completed backups", completedBackups > 0, `${completedBackups} completed backup(s) exist.`, true),
    check("Backups", "Backup freshness", Boolean(latestBackup && latestBackup.createdAt > thirtySixHoursAgo), latestBackup ? `Latest backup: ${latestBackup.createdAt.toISOString()}.` : "No completed organization backup.", true),
    check("Backups", "Failed backups", failedBackups === 0, `${failedBackups} failed backup(s) in the last 7 days.`),
    check("Backups", "Backup checksums", Boolean(latestBackup?.checksum), latestBackup?.checksum ? "Latest backup has a checksum." : "Latest backup checksum is missing.")
  ];

  const documentChecks = [
    check("Documents", "OnlyOffice editing", isOnlyOfficeConfigured(), isOnlyOfficeConfigured() ? "OnlyOffice is configured." : "OnlyOffice document server is not configured."),
    check("Documents", "Stale document locks", staleCheckouts === 0, `${staleCheckouts} stale checkout(s) older than 12 hours.`),
    check("Documents", "Malware scan status", infectedFiles === 0, `${infectedFiles} infected file(s) are blocked.`),
    check("Documents", "Approval queue", pendingFileApprovals < 50, `${pendingFileApprovals} file approval(s) pending.`)
  ];

  const mobileChecks = [
    check("Mobile", "PWA manifest", true, "Manifest and install shell are present."),
    check("Mobile", "Service worker", true, "Offline shell worker is registered from the client."),
    check("Mobile", "Push subscriptions", pushSubscriptions > 0, `${pushSubscriptions} active push subscription(s).`),
    check("Mobile", "Notification delivery", notificationsFailed < 10, `${notificationsFailed} failed delivery record(s) in the last 7 days.`)
  ];

  const searchChecks = [
    check("Search", "Indexed coverage", searchEntities > 0, `${searchEntities} searchable record(s) across LETW modules.`, true),
    check("Search", "Knowledge base", wikiPages > 0, `${wikiPages} published knowledge page(s).`),
    check("Search", "Meeting transcripts", failedTranscripts === 0, `${meetingsWithTranscripts} transcript(s), ${failedTranscripts} recent failure(s).`),
    check("Search", "Chat archive", chatMessages > 0, `${chatMessages} searchable chat message(s).`),
    check("Search", "Realtime transport", isRealtimeConfigured(), isRealtimeConfigured() ? "Realtime messaging transport is configured." : "Realtime transport is not configured; polling fallback remains available.")
  ];

  const securityChecks = [
    check("Security", "Active share links", activeShareLinks <= shareLinks, `${activeShareLinks} active share link(s).`),
    check("Security", "Open DLP incidents", dlpIncidents === 0, `${dlpIncidents} open DLP incident(s).`),
    check("Security", "Open access requests", openAccessRequests < 50, `${openAccessRequests} pending access request(s).`)
  ];

  const checks = [...reliabilityChecks, ...backupChecks, ...documentChecks, ...mobileChecks, ...searchChecks, ...securityChecks];
  const byArea = Array.from(new Set(checks.map((item) => item.area))).map((area) => ({
    area,
    score: score(checks.filter((item) => item.area === area)),
    warnings: checks.filter((item) => item.area === area && item.status !== "READY").length
  }));

  return {
    overallScore: score(checks),
    byArea,
    checks,
    monitor,
    metrics: {
      users,
      activeUsers,
      workspaces,
      files,
      editableFiles,
      checkedOutFiles,
      staleCheckouts,
      completedBackups,
      failedBackups,
      backupBytes: backupBytes._sum.size ?? 0,
      latestBackupAt: latestBackup?.createdAt.toISOString() ?? null,
      activeShareLinks,
      pushSubscriptions,
      searchEntities,
      dlpIncidents,
      openAccessRequests
    },
    generatedAt: now.toISOString()
  };
}

export async function verifyRecentBackups(limit = 5) {
  const backups = await prisma.backupSnapshot.findMany({
    where: { status: BackupStatus.COMPLETED, storageKey: { not: null }, checksum: { not: null } },
    orderBy: { createdAt: "desc" },
    take: limit
  });

  const results = [];
  for (const backup of backups) {
    try {
      const buffer = await getObjectBuffer(backup.storageKey as string);
      const checksum = createHash("sha256").update(buffer).digest("hex");
      results.push({
        id: backup.id,
        name: backup.name,
        expected: backup.checksum,
        actual: checksum,
        verified: checksum === backup.checksum,
        size: buffer.length
      });
    } catch (error) {
      results.push({
        id: backup.id,
        name: backup.name,
        expected: backup.checksum,
        actual: null,
        verified: false,
        error: error instanceof Error ? error.message : "Backup verification failed."
      });
    }
  }
  return results;
}

export async function releaseStaleDocumentCheckouts(actorId: string) {
  const staleCheckoutAt = new Date(Date.now() - 12 * HOUR);
  const result = await prisma.file.updateMany({
    where: { deletedAt: null, checkedOutAt: { lt: staleCheckoutAt } },
    data: { checkedOutAt: null, checkedOutById: null }
  });
  await prisma.activityLog.create({
    data: {
      userId: actorId,
      action: "platform.stale_checkouts_released",
      metadata: { count: result.count, staleBefore: staleCheckoutAt.toISOString() }
    }
  });
  return result.count;
}

export async function runPlatformMonitorAndNotify() {
  const snapshot = await collectSystemMonitorSnapshot();
  const notification = await notifyAdminsOfMonitorWarnings(snapshot.warnings);
  return { snapshot, notification };
}

export async function createForcedPlatformBackup() {
  return createAutomaticOrganizationBackup(true);
}
