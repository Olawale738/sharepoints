import { randomBytes } from "node:crypto";

import {
  AccessRequestStatus,
  ApprovalStatus,
  CalendarConflictStatus,
  ExternalGuestStatus,
  GrowthPriority,
  NotificationPriority,
  PrayerAssignmentStatus,
  PresidentDelegationStatus,
  ResourceBookingStatus,
  ServicePlanStatus,
  WorkspaceRole
} from "@prisma/client";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError } from "@/lib/api";
import { isPresidentAuthority } from "@/lib/president-controls";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

type DelegationPermission =
  | "canIssueCertificates"
  | "canIssueIdCards"
  | "canIssueLetters"
  | "canManagePrayerAssignments"
  | "canResolveCalendarConflicts"
  | "canManageExternalGuests"
  | "canRunSystemCleanup";

type CalendarItem = {
  kind: string;
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  workspaceId?: string | null;
  organizationUnitId?: string | null;
  resourceId?: string | null;
  ownerId?: string | null;
};

function baseUrl() {
  return process.env.AUTH_URL || process.env.NEXTAUTH_URL || "https://sharepoints.letw.org";
}

function secureToken() {
  return randomBytes(32).toString("hex");
}

function overlaps(a: CalendarItem, b: CalendarItem) {
  return a.startsAt < b.endsAt && b.startsAt < a.endsAt;
}

function effectiveEnd(startsAt: Date, endsAt?: Date | null) {
  return endsAt && endsAt > startsAt ? endsAt : new Date(startsAt.getTime() + 2 * 60 * 60 * 1000);
}

function hasScopeConflict(a: CalendarItem, b: CalendarItem) {
  if (a.resourceId && b.resourceId && a.resourceId === b.resourceId) return "RESOURCE";
  if (a.workspaceId && b.workspaceId && a.workspaceId === b.workspaceId) return "WORKSPACE";
  if (a.organizationUnitId && b.organizationUnitId && a.organizationUnitId === b.organizationUnitId) return "ORGANIZATION_UNIT";
  if (a.ownerId && b.ownerId && a.ownerId === b.ownerId) return "LEADER";
  return null;
}

export async function hasActivePresidentDelegation(userId: string, permission: DelegationPermission) {
  const now = new Date();
  const delegation = await prisma.presidentDelegation.findFirst({
    where: {
      delegatedToId: userId,
      status: PresidentDelegationStatus.ACTIVE,
      revokedAt: null,
      startsAt: { lte: now },
      expiresAt: { gt: now },
      [permission]: true
    },
    select: { id: true }
  });
  return Boolean(delegation);
}

export async function hasAnyActivePresidentDelegation(userId: string) {
  const now = new Date();
  const delegation = await prisma.presidentDelegation.findFirst({
    where: {
      delegatedToId: userId,
      status: PresidentDelegationStatus.ACTIVE,
      revokedAt: null,
      startsAt: { lte: now },
      expiresAt: { gt: now }
    },
    select: { id: true }
  });
  return Boolean(delegation);
}

export async function requirePresidentOrDelegation(actorId: string, permission: DelegationPermission, message: string) {
  if (await isPresidentAuthority(actorId)) return;
  if (await hasActivePresidentDelegation(actorId, permission)) return;
  throw new ApiError(403, message);
}

export async function listExecutiveOperationsCenter() {
  const now = new Date();
  const oldDeviceCutoff = new Date(now.getTime() - 90 * 86_400_000);
  const staleRequestCutoff = new Date(now.getTime() - 90 * 86_400_000);
  const [
    users,
    workspaces,
    files,
    units,
    departments,
    resources,
    prayerAssignments,
    calendarConflicts,
    externalGuests,
    delegations,
    cleanupPreview
  ] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null, suspendedAt: null, accessRevokedAt: null, email: { endsWith: "@letw.org" } },
      select: { id: true, name: true, email: true, category: true, memberProfile: { select: { organizationPosition: true, membershipNumber: true } } },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      take: 1000
    }),
    prisma.workspace.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 500
    }),
    prisma.file.findMany({
      where: { deletedAt: null, approvalStatus: ApprovalStatus.APPROVED },
      select: { id: true, fileName: true, workspaceId: true },
      orderBy: { createdAt: "desc" },
      take: 500
    }),
    prisma.organizationUnit.findMany({
      where: { active: true },
      select: { id: true, name: true, type: true, countryCode: true },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      take: 1000
    }),
    prisma.department.findMany({
      select: { id: true, name: true, kind: true },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      take: 500
    }),
    prisma.churchResource.findMany({
      where: { active: true },
      select: { id: true, name: true, category: true, location: true },
      orderBy: [{ category: "asc" }, { name: "asc" }],
      take: 500
    }),
    prisma.prayerAssignment.findMany({ orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }], take: 200 }),
    prisma.churchCalendarConflict.findMany({ orderBy: [{ status: "asc" }, { startsAt: "asc" }], take: 200 }),
    prisma.externalGuestAccess.findMany({ orderBy: [{ status: "asc" }, { expiresAt: "asc" }], take: 200 }),
    prisma.presidentDelegation.findMany({ orderBy: [{ status: "asc" }, { expiresAt: "asc" }], take: 200 }),
    Promise.all([
      prisma.temporaryWorkspaceAccess.count({ where: { revokedAt: null, expiresAt: { lt: now } } }),
      prisma.fileAccessGrant.count({ where: { revokedAt: null, expiresAt: { lt: now } } }),
      prisma.fileShareLink.count({ where: { expiresAt: { lt: now } } }),
      prisma.officialIssuanceGrant.count({ where: { revokedAt: null, expiresAt: { lt: now } } }),
      prisma.userDevice.count({ where: { revokedAt: null, lastSeenAt: { lt: oldDeviceCutoff } } }),
      prisma.presidentDelegation.count({ where: { status: PresidentDelegationStatus.ACTIVE, expiresAt: { lt: now } } }),
      prisma.externalGuestAccess.count({ where: { status: ExternalGuestStatus.ACTIVE, expiresAt: { lt: now } } }),
      prisma.accessRequest.count({ where: { status: AccessRequestStatus.PENDING, createdAt: { lt: staleRequestCutoff } } })
    ]).then(([workspaceAccess, fileAccess, shareLinks, issuanceGrants, oldDevices, delegationsExpired, guestsExpired, staleAccessRequests]) => ({
      workspaceAccess,
      fileAccess,
      shareLinks,
      issuanceGrants,
      oldDevices,
      delegationsExpired,
      guestsExpired,
      staleAccessRequests,
      total:
        workspaceAccess +
        fileAccess +
        shareLinks +
        issuanceGrants +
        oldDevices +
        delegationsExpired +
        guestsExpired +
        staleAccessRequests
    }))
  ]);

  return { users, workspaces, files, units, departments, resources, prayerAssignments, calendarConflicts, externalGuests, delegations, cleanupPreview };
}

export async function createPrayerAssignment(actorId: string, input: {
  title: string;
  prayerPoint: string;
  category?: string | null;
  priority?: GrowthPriority;
  workspaceId?: string | null;
  organizationUnitId?: string | null;
  departmentId?: string | null;
  assignedToUserId?: string | null;
  assignedWorkspaceId?: string | null;
  assignedOrganizationUnitId?: string | null;
  assignedDepartmentId?: string | null;
  dueAt?: Date | null;
}) {
  const assignment = await prisma.prayerAssignment.create({
    data: {
      title: input.title,
      prayerPoint: input.prayerPoint,
      category: input.category || "GENERAL",
      priority: input.priority ?? GrowthPriority.NORMAL,
      workspaceId: input.workspaceId ?? null,
      organizationUnitId: input.organizationUnitId ?? null,
      departmentId: input.departmentId ?? null,
      assignedToUserId: input.assignedToUserId ?? null,
      assignedWorkspaceId: input.assignedWorkspaceId ?? null,
      assignedOrganizationUnitId: input.assignedOrganizationUnitId ?? null,
      assignedDepartmentId: input.assignedDepartmentId ?? null,
      dueAt: input.dueAt ?? null,
      createdById: actorId
    }
  });

  if (assignment.assignedToUserId) {
    await notifyUsers([assignment.assignedToUserId], {
      workspaceId: assignment.workspaceId ?? undefined,
      type: "TASK_ASSIGNED",
      title: "Prayer assignment",
      body: assignment.title,
      href: "/dashboard/admin/executive-operations",
      priority: NotificationPriority.HIGH
    }).catch(() => null);
  }

  await logActivity({
    userId: actorId,
    workspaceId: assignment.workspaceId ?? undefined,
    action: activityActions.prayerAssignmentCreated,
    targetId: assignment.id,
    metadata: { title: assignment.title, priority: assignment.priority }
  });
  return assignment;
}

export async function updatePrayerAssignment(actorId: string, id: string, input: {
  status?: PrayerAssignmentStatus;
  completionNotes?: string | null;
  testimony?: string | null;
}) {
  const status = input.status;
  const assignment = await prisma.prayerAssignment.update({
    where: { id },
    data: {
      status,
      completionNotes: input.completionNotes ?? undefined,
      testimony: input.testimony ?? undefined,
      completedAt:
        status === PrayerAssignmentStatus.COMPLETED || status === PrayerAssignmentStatus.TESTIMONY_RECORDED
          ? new Date()
          : undefined,
      updatedById: actorId
    }
  });
  await logActivity({
    userId: actorId,
    workspaceId: assignment.workspaceId ?? undefined,
    action: activityActions.prayerAssignmentUpdated,
    targetId: id,
    metadata: { status: assignment.status }
  });
  return assignment;
}

export async function scanCalendarConflicts(actorId: string) {
  const now = new Date();
  const until = new Date(now.getTime() + 180 * 86_400_000);
  const [meetings, bookings, servicePlans] = await Promise.all([
    prisma.workspaceMeeting.findMany({
      where: { cancelledAt: null, approvalStatus: ApprovalStatus.APPROVED, startsAt: { gte: now, lte: until } },
      select: { id: true, title: true, startsAt: true, endsAt: true, workspaceId: true, createdById: true },
      take: 300
    }),
    prisma.resourceBooking.findMany({
      where: { status: { in: [ResourceBookingStatus.PENDING, ResourceBookingStatus.APPROVED] }, startsAt: { gte: now, lte: until } },
      select: { id: true, title: true, startsAt: true, endsAt: true, workspaceId: true, resourceId: true, requestedById: true },
      take: 300
    }),
    prisma.servicePlan.findMany({
      where: { status: { in: [ServicePlanStatus.DRAFT, ServicePlanStatus.READY] }, startsAt: { gte: now, lte: until } },
      select: { id: true, title: true, startsAt: true, endsAt: true, workspaceId: true, organizationUnitId: true, coordinatorId: true },
      take: 300
    })
  ]);

  const items: CalendarItem[] = [
    ...meetings.map((item) => ({
      kind: "MEETING",
      id: item.id,
      title: item.title,
      startsAt: item.startsAt,
      endsAt: effectiveEnd(item.startsAt, item.endsAt),
      workspaceId: item.workspaceId,
      ownerId: item.createdById
    })),
    ...bookings.map((item) => ({
      kind: "RESOURCE_BOOKING",
      id: item.id,
      title: item.title,
      startsAt: item.startsAt,
      endsAt: effectiveEnd(item.startsAt, item.endsAt),
      workspaceId: item.workspaceId,
      resourceId: item.resourceId,
      ownerId: item.requestedById
    })),
    ...servicePlans.map((item) => ({
      kind: "SERVICE_PLAN",
      id: item.id,
      title: item.title,
      startsAt: item.startsAt,
      endsAt: effectiveEnd(item.startsAt, item.endsAt),
      workspaceId: item.workspaceId,
      organizationUnitId: item.organizationUnitId,
      ownerId: item.coordinatorId
    }))
  ];

  const conflicts = [];
  for (let index = 0; index < items.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < items.length; otherIndex += 1) {
      const first = items[index];
      const second = items[otherIndex];
      if (!first || !second || !overlaps(first, second)) continue;
      const conflictType = hasScopeConflict(first, second);
      if (!conflictType) continue;
      const startsAt = first.startsAt > second.startsAt ? first.startsAt : second.startsAt;
      const endsAt = first.endsAt < second.endsAt ? first.endsAt : second.endsAt;
      conflicts.push({
        conflictType,
        severity: conflictType === "RESOURCE" ? GrowthPriority.HIGH : GrowthPriority.NORMAL,
        title: `${conflictType.toLowerCase().replaceAll("_", " ")} conflict`,
        details: `${first.kind}: ${first.title} overlaps ${second.kind}: ${second.title}.`,
        firstKind: first.kind,
        firstId: first.id,
        secondKind: second.kind,
        secondId: second.id,
        workspaceId: first.workspaceId ?? second.workspaceId ?? null,
        organizationUnitId: first.organizationUnitId ?? second.organizationUnitId ?? null,
        resourceId: first.resourceId ?? second.resourceId ?? null,
        startsAt,
        endsAt,
        detectedById: actorId
      });
    }
  }

  await prisma.churchCalendarConflict.deleteMany({ where: { status: CalendarConflictStatus.OPEN } });
  if (conflicts.length) {
    await prisma.churchCalendarConflict.createMany({ data: conflicts.slice(0, 500) });
  }
  await logActivity({
    userId: actorId,
    action: activityActions.calendarIntelligenceScanned,
    metadata: { conflicts: conflicts.length, scannedItems: items.length }
  });
  return { conflicts: conflicts.length, scannedItems: items.length };
}

export async function updateCalendarConflict(actorId: string, id: string, status: CalendarConflictStatus) {
  const conflict = await prisma.churchCalendarConflict.update({
    where: { id },
    data: {
      status,
      resolvedById: status === CalendarConflictStatus.RESOLVED || status === CalendarConflictStatus.DISMISSED ? actorId : null,
      resolvedAt: status === CalendarConflictStatus.RESOLVED || status === CalendarConflictStatus.DISMISSED ? new Date() : null
    }
  });
  await logActivity({ userId: actorId, action: activityActions.calendarConflictUpdated, targetId: id, metadata: { status } });
  return conflict;
}

export async function createExternalGuest(actorId: string, input: {
  name: string;
  email: string;
  organization?: string | null;
  guestType?: string | null;
  purpose: string;
  workspaceId?: string | null;
  fileId?: string | null;
  expiresAt: Date;
}) {
  if (!input.workspaceId && !input.fileId) throw new ApiError(422, "Select a workspace or file for the guest portal.");
  let workspaceId = input.workspaceId ?? null;
  if (input.fileId) {
    const file = await prisma.file.findFirst({ where: { id: input.fileId, deletedAt: null }, select: { workspaceId: true } });
    if (!file) throw new ApiError(404, "File not found.");
    workspaceId = file.workspaceId;
  }
  if (workspaceId) {
    const workspace = await prisma.workspace.findFirst({ where: { id: workspaceId, deletedAt: null }, select: { id: true } });
    if (!workspace) throw new ApiError(404, "Workspace not found.");
  }
  const guest = await prisma.externalGuestAccess.create({
    data: {
      name: input.name,
      email: input.email.toLowerCase(),
      organization: input.organization || null,
      guestType: input.guestType || "PARTNER",
      purpose: input.purpose,
      token: secureToken(),
      workspaceId,
      fileId: input.fileId ?? null,
      expiresAt: input.expiresAt,
      grantedById: actorId
    }
  });
  await logActivity({
    userId: actorId,
    workspaceId: guest.workspaceId ?? undefined,
    action: activityActions.externalGuestCreated,
    targetId: guest.id,
    metadata: { email: guest.email, expiresAt: guest.expiresAt.toISOString() }
  });
  return { guest, portalUrl: `${baseUrl()}/guest/${guest.token}` };
}

export async function revokeExternalGuest(actorId: string, id: string) {
  const guest = await prisma.externalGuestAccess.update({
    where: { id },
    data: { status: ExternalGuestStatus.REVOKED, revokedAt: new Date(), revokedById: actorId }
  });
  await logActivity({ userId: actorId, workspaceId: guest.workspaceId ?? undefined, action: activityActions.externalGuestRevoked, targetId: id });
  return guest;
}

export async function createPresidentDelegation(actorId: string, input: {
  delegatedToId: string;
  startsAt?: Date | null;
  expiresAt: Date;
  canIssueCertificates: boolean;
  canIssueIdCards: boolean;
  canIssueLetters: boolean;
  canManagePrayerAssignments: boolean;
  canResolveCalendarConflicts: boolean;
  canManageExternalGuests: boolean;
  canRunSystemCleanup: boolean;
  reason?: string | null;
}) {
  if (!(await isPresidentAuthority(actorId))) throw new ApiError(403, "Only the LETW president can delegate presidential powers.");
  if (input.expiresAt <= new Date()) throw new ApiError(422, "Delegation expiry must be in the future.");
  const target = await prisma.user.findFirst({
    where: {
      id: input.delegatedToId,
      deletedAt: null,
      suspendedAt: null,
      accessRevokedAt: null,
      email: { endsWith: "@letw.org" },
      workspaceMemberships: { some: { role: { in: [WorkspaceRole.ADMIN, WorkspaceRole.LEADER, WorkspaceRole.MODERATOR] } } }
    },
    select: { id: true, email: true, name: true }
  });
  if (!target) throw new ApiError(404, "Select an active LETW admin, leader, or moderator.");

  const delegation = await prisma.presidentDelegation.create({
    data: {
      delegatedToId: target.id,
      grantedById: actorId,
      startsAt: input.startsAt ?? new Date(),
      expiresAt: input.expiresAt,
      canIssueCertificates: input.canIssueCertificates,
      canIssueIdCards: input.canIssueIdCards,
      canIssueLetters: input.canIssueLetters,
      canManagePrayerAssignments: input.canManagePrayerAssignments,
      canResolveCalendarConflicts: input.canResolveCalendarConflicts,
      canManageExternalGuests: input.canManageExternalGuests,
      canRunSystemCleanup: input.canRunSystemCleanup,
      reason: input.reason ?? null
    }
  });

  if (input.canIssueCertificates || input.canIssueIdCards || input.canIssueLetters) {
    await prisma.officialIssuanceGrant.upsert({
      where: { userId: target.id },
      create: {
        userId: target.id,
        grantedById: actorId,
        canIssueCertificates: input.canIssueCertificates,
        canIssueIdCards: input.canIssueIdCards,
        canIssueLetters: input.canIssueLetters,
        expiresAt: input.expiresAt,
        reason: `President delegation: ${input.reason ?? delegation.id}`
      },
      update: {
        grantedById: actorId,
        canIssueCertificates: input.canIssueCertificates,
        canIssueIdCards: input.canIssueIdCards,
        canIssueLetters: input.canIssueLetters,
        expiresAt: input.expiresAt,
        revokedAt: null,
        revokedById: null,
        reason: `President delegation: ${input.reason ?? delegation.id}`
      }
    });
  }

  await notifyUsers([target.id], {
    type: "SYSTEM_ALERT",
    title: "President delegation granted",
    body: "You have temporary LETW authority for approved executive actions.",
    href: "/dashboard/admin/executive-operations",
    priority: NotificationPriority.HIGH
  }).catch(() => null);
  await logActivity({
    userId: actorId,
    action: activityActions.presidentDelegationCreated,
    targetId: delegation.id,
    metadata: { delegatedToId: target.id, expiresAt: delegation.expiresAt.toISOString() }
  });
  return delegation;
}

export async function revokePresidentDelegation(actorId: string, id: string) {
  if (!(await isPresidentAuthority(actorId))) throw new ApiError(403, "Only the LETW president can revoke presidential delegation.");
  const delegation = await prisma.presidentDelegation.update({
    where: { id },
    data: { status: PresidentDelegationStatus.REVOKED, revokedAt: new Date(), revokedById: actorId }
  });
  const activeIssuingDelegation = await prisma.presidentDelegation.findFirst({
    where: {
      delegatedToId: delegation.delegatedToId,
      id: { not: delegation.id },
      status: PresidentDelegationStatus.ACTIVE,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      OR: [{ canIssueCertificates: true }, { canIssueIdCards: true }, { canIssueLetters: true }]
    },
    select: { id: true }
  });
  if (!activeIssuingDelegation) {
    const grant = await prisma.officialIssuanceGrant.findUnique({ where: { userId: delegation.delegatedToId } });
    if (grant?.reason?.startsWith("President delegation:")) {
      await prisma.officialIssuanceGrant.update({
        where: { userId: delegation.delegatedToId },
        data: { revokedAt: new Date(), revokedById: actorId, canIssueCertificates: false, canIssueIdCards: false, canIssueLetters: false }
      });
    }
  }
  await logActivity({ userId: actorId, action: activityActions.presidentDelegationRevoked, targetId: id, metadata: { delegatedToId: delegation.delegatedToId } });
  return delegation;
}

export async function runSystemAccessCleanup(actorId: string) {
  const now = new Date();
  const oldDeviceCutoff = new Date(now.getTime() - 90 * 86_400_000);
  const staleRequestCutoff = new Date(now.getTime() - 90 * 86_400_000);
  const result = await prisma.$transaction(async (tx) => {
    const [workspaceAccess, fileAccess, shareLinks, issuanceGrants, oldDevices, delegationsExpired, guestsExpired, staleAccessRequests] =
      await Promise.all([
        tx.temporaryWorkspaceAccess.updateMany({ where: { revokedAt: null, expiresAt: { lt: now } }, data: { revokedAt: now } }),
        tx.fileAccessGrant.updateMany({ where: { revokedAt: null, expiresAt: { lt: now } }, data: { revokedAt: now } }),
        tx.fileShareLink.deleteMany({ where: { expiresAt: { lt: now } } }),
        tx.officialIssuanceGrant.updateMany({
          where: { revokedAt: null, expiresAt: { lt: now } },
          data: { revokedAt: now, revokedById: actorId, canIssueCertificates: false, canIssueIdCards: false, canIssueLetters: false }
        }),
        tx.userDevice.updateMany({ where: { revokedAt: null, lastSeenAt: { lt: oldDeviceCutoff } }, data: { revokedAt: now } }),
        tx.presidentDelegation.updateMany({ where: { status: PresidentDelegationStatus.ACTIVE, expiresAt: { lt: now } }, data: { status: PresidentDelegationStatus.EXPIRED } }),
        tx.externalGuestAccess.updateMany({ where: { status: ExternalGuestStatus.ACTIVE, expiresAt: { lt: now } }, data: { status: ExternalGuestStatus.EXPIRED } }),
        tx.accessRequest.updateMany({ where: { status: AccessRequestStatus.PENDING, createdAt: { lt: staleRequestCutoff } }, data: { status: AccessRequestStatus.CANCELLED, decidedAt: now, reviewerId: actorId, decisionReason: "System cleanup cancelled stale request." } })
      ]);
    return {
      workspaceAccess: workspaceAccess.count,
      fileAccess: fileAccess.count,
      shareLinks: shareLinks.count,
      issuanceGrants: issuanceGrants.count,
      oldDevices: oldDevices.count,
      delegationsExpired: delegationsExpired.count,
      guestsExpired: guestsExpired.count,
      staleAccessRequests: staleAccessRequests.count
    };
  });

  await logActivity({ userId: actorId, action: activityActions.systemCleanupRun, metadata: result });
  return result;
}
