import { randomBytes } from "crypto";
import {
  ChurchEventType,
  FollowUpStatus,
  NotificationPriority,
  Prisma,
  ServicePlanStatus,
  TaskStatus,
  TrainingEnrollmentStatus,
  VisitorJourneyStage,
  WorkspaceAudienceMode,
  WorkspaceRole
} from "@prisma/client";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError } from "@/lib/api";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole, hasWorkspaceAdminAccess } from "@/lib/rbac";

const leadershipRoles = [WorkspaceRole.ADMIN, WorkspaceRole.LEADER, WorkspaceRole.MODERATOR] as const;
const activeUserWhere = {
  deletedAt: null,
  suspendedAt: null,
  accessRevokedAt: null
} as const;

export type LeadershipAccess = Awaited<ReturnType<typeof getLeadershipAccess>>;

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function currency(amountCents: number, currencyCode = "GBP") {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currencyCode
  }).format(amountCents / 100);
}

function nextAnnualOccurrence(value: Date, now: Date) {
  const next = new Date(Date.UTC(now.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (next < today) {
    next.setUTCFullYear(next.getUTCFullYear() + 1);
  }
  return next;
}

function daysBetween(start: Date, end: Date) {
  return Math.ceil((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

function receiptNumber() {
  return `LETW-GIVE-${new Date().getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function formatIsoDay(value: Date) {
  return value.toISOString().slice(0, 10);
}

async function descendantUnitIds(rootIds: string[]) {
  if (!rootIds.length) return [];
  const units = await prisma.organizationUnit.findMany({
    where: { active: true },
    select: { id: true, parentId: true }
  });
  const children = new Map<string, string[]>();
  units.forEach((unit) => {
    if (!unit.parentId) return;
    children.set(unit.parentId, [...(children.get(unit.parentId) ?? []), unit.id]);
  });
  const seen = new Set(rootIds);
  const queue = [...rootIds];
  while (queue.length) {
    const current = queue.shift()!;
    for (const child of children.get(current) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      queue.push(child);
    }
  }
  return Array.from(seen);
}

export async function getLeadershipAccess(userId: string) {
  const [isAdmin, user, memberships, leadershipAssignments] = await Promise.all([
    hasAnyWorkspaceAdminRole(userId),
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, departmentId: true, category: true }
    }),
    prisma.workspaceMember.findMany({
      where: {
        userId,
        workspace: { deletedAt: null }
      },
      select: {
        workspaceId: true,
        role: true,
        workspace: {
          select: {
            id: true,
            name: true,
            audienceMode: true,
            memberDirectoryOpen: true,
            organizationUnitId: true,
            scopeType: true
          }
        }
      },
      orderBy: { joinedAt: "asc" }
    }),
    prisma.organizationUnitLeader.findMany({
      where: { userId },
      select: {
        id: true,
        unitId: true,
        userId: true,
        title: true,
        canCreateWorkspaces: true,
        inheritToChildren: true,
        assignedById: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: "desc" }
    })
  ]);

  if (!user) {
    throw new ApiError(404, "User not found.");
  }

  const assignedUnitIds = leadershipAssignments.map((assignment) => assignment.unitId);
  const inheritedUnitIds = await descendantUnitIds(
    leadershipAssignments.filter((assignment) => assignment.inheritToChildren).map((assignment) => assignment.unitId)
  );
  const allUnitIds = isAdmin
    ? (await prisma.organizationUnit.findMany({ where: { active: true }, select: { id: true } })).map((unit) => unit.id)
    : Array.from(new Set([...assignedUnitIds, ...inheritedUnitIds]));
  const leadershipWorkspaceIds = memberships
    .filter((membership) => leadershipRoles.includes(membership.role as (typeof leadershipRoles)[number]))
    .map((membership) => membership.workspaceId);
  const openDirectoryWorkspaceIds = memberships
    .filter((membership) => membership.workspace.memberDirectoryOpen)
    .map((membership) => membership.workspaceId);

  return {
    user,
    isAdmin,
    canUseLeadership:
      isAdmin || leadershipAssignments.length > 0 || memberships.some((membership) => leadershipRoles.includes(membership.role as (typeof leadershipRoles)[number])),
    memberships,
    leadershipAssignments,
    unitIds: allUnitIds,
    leadershipWorkspaceIds,
    openDirectoryWorkspaceIds,
    joinedWorkspaceIds: memberships.map((membership) => membership.workspaceId)
  };
}

export async function requireLeadershipAccess(userId: string) {
  const access = await getLeadershipAccess(userId);
  if (!access.canUseLeadership) {
    throw new ApiError(403, "Only admins, leaders, and moderators can use the leadership command suite.");
  }
  return access;
}

export async function getLeadershipWorkspaces(access: LeadershipAccess) {
  if (access.isAdmin) {
    return prisma.workspace.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        audienceMode: true,
        memberDirectoryOpen: true,
        organizationUnitId: true,
        scopeType: true,
        _count: { select: { members: true, files: true, chatChannels: true } }
      },
      orderBy: { name: "asc" }
    });
  }

  return prisma.workspace.findMany({
    where: {
      deletedAt: null,
      OR: [
        { id: { in: access.leadershipWorkspaceIds } },
        { organizationUnitId: { in: access.unitIds } }
      ]
    },
    select: {
      id: true,
      name: true,
      audienceMode: true,
      memberDirectoryOpen: true,
      organizationUnitId: true,
      scopeType: true,
      _count: { select: { members: true, files: true, chatChannels: true } }
    },
    orderBy: { name: "asc" }
  });
}

export async function getLeadershipDirectory(userId: string) {
  const access = await getLeadershipAccess(userId);
  const visibleWorkspaceIds = access.canUseLeadership
    ? Array.from(new Set([...access.leadershipWorkspaceIds, ...access.openDirectoryWorkspaceIds]))
    : access.openDirectoryWorkspaceIds;

  const where: Prisma.UserWhereInput = access.isAdmin
    ? activeUserWhere
    : {
        ...activeUserWhere,
        OR: [
          { id: userId },
          ...(access.user.departmentId ? [{ departmentId: access.user.departmentId }] : []),
          ...(access.unitIds.length ? [{ memberProfile: { currentOrganizationUnitId: { in: access.unitIds } } }] : []),
          ...(visibleWorkspaceIds.length
            ? [{ workspaceMemberships: { some: { workspaceId: { in: visibleWorkspaceIds } } } }]
            : [])
        ]
      };

  const users = await prisma.user.findMany({
    where,
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      category: true,
      department: { select: { name: true, kind: true } },
      memberProfile: {
        select: {
          phone: true,
          alternatePhone: true,
          membershipNumber: true,
          membershipStatus: true,
          dateOfBirth: true,
          weddingAnniversaryAt: true,
          baptismAt: true,
          membershipStartedAt: true,
          organizationPosition: true,
          digitalIdLocation: true,
          currentOrganizationUnitId: true,
          ministryInterests: true,
          skills: true
        }
      },
      workspaceMemberships: {
        where: access.isAdmin
          ? { workspace: { deletedAt: null } }
          : { workspaceId: { in: visibleWorkspaceIds.length ? visibleWorkspaceIds : ["__none__"] } },
        select: {
          role: true,
          workspace: { select: { id: true, name: true, audienceMode: true } }
        }
      }
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    take: 600
  });

  return {
    canBrowseDirectory: access.isAdmin || access.canUseLeadership || access.openDirectoryWorkspaceIds.length > 0,
    scope: {
      isAdmin: access.isAdmin,
      unitIds: access.unitIds,
      workspaceIds: visibleWorkspaceIds
    },
    members: users.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      category: user.category,
      department: user.department,
      profile: {
        phone: access.canUseLeadership || user.id === userId ? user.memberProfile?.phone ?? null : null,
        alternatePhone: access.canUseLeadership || user.id === userId ? user.memberProfile?.alternatePhone ?? null : null,
        membershipNumber: user.memberProfile?.membershipNumber ?? null,
        membershipStatus: user.memberProfile?.membershipStatus ?? "ACTIVE",
        dateOfBirth: user.memberProfile?.dateOfBirth?.toISOString() ?? null,
        weddingAnniversaryAt: user.memberProfile?.weddingAnniversaryAt?.toISOString() ?? null,
        baptismAt: user.memberProfile?.baptismAt?.toISOString() ?? null,
        membershipStartedAt: user.memberProfile?.membershipStartedAt?.toISOString() ?? null,
        organizationPosition: user.memberProfile?.organizationPosition ?? null,
        digitalIdLocation: user.memberProfile?.digitalIdLocation ?? "LETTW Worldwide",
        currentOrganizationUnitId: user.memberProfile?.currentOrganizationUnitId ?? null,
        ministryInterests: Array.isArray(user.memberProfile?.ministryInterests) ? user.memberProfile?.ministryInterests : [],
        skills: Array.isArray(user.memberProfile?.skills) ? user.memberProfile?.skills : []
      },
      workspaces: user.workspaceMemberships.map((membership) => ({
        id: membership.workspace.id,
        name: membership.workspace.name,
        role: membership.role,
        audienceMode: membership.workspace.audienceMode
      }))
    }))
  };
}

async function getUpcomingMilestones(access: LeadershipAccess, memberIds: string[]) {
  const now = new Date();
  const horizon = new Date(now.getTime() + 45 * 24 * 60 * 60 * 1000);
  const profiles = await prisma.user.findMany({
    where: {
      id: { in: memberIds },
      ...activeUserWhere
    },
    select: {
      id: true,
      name: true,
      email: true,
      memberProfile: {
        select: {
          dateOfBirth: true,
          weddingAnniversaryAt: true,
          baptismAt: true,
          membershipStartedAt: true,
          firstVisitAt: true,
          currentOrganizationUnitId: true
        }
      }
    },
    take: 600
  });

  const items: Array<{
    userId: string;
    name: string;
    email: string | null;
    type: string;
    date: string;
    daysAway: number;
  }> = [];

  for (const user of profiles) {
    const profile = user.memberProfile;
    if (!profile) continue;
    const dates = [
      ["Birthday", profile.dateOfBirth],
      ["Wedding anniversary", profile.weddingAnniversaryAt],
      ["Baptism anniversary", profile.baptismAt],
      ["Membership anniversary", profile.membershipStartedAt],
      ["First visit anniversary", profile.firstVisitAt]
    ] as const;
    for (const [type, value] of dates) {
      if (!value) continue;
      const next = nextAnnualOccurrence(value, now);
      if (next <= horizon) {
        items.push({
          userId: user.id,
          name: user.name ?? user.email ?? "LETW member",
          email: user.email,
          type,
          date: formatIsoDay(next),
          daysAway: Math.max(0, daysBetween(now, next))
        });
      }
    }
  }

  return items.sort((a, b) => a.daysAway - b.daysAway || a.name.localeCompare(b.name)).slice(0, access.isAdmin ? 100 : 40);
}

async function detectSilentAbsences(memberIds: string[]) {
  const since = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const users = await prisma.user.findMany({
    where: { id: { in: memberIds }, ...activeUserWhere },
    select: {
      id: true,
      name: true,
      email: true,
      memberProfile: {
        select: {
          membershipStatus: true,
          phone: true,
          currentOrganizationUnitId: true
        }
      }
    },
    take: 600
  });
  if (!users.length) return [];
  const followUpContactFilters = users
    .flatMap((user) => [
      user.email ? { email: user.email } : null,
      user.memberProfile?.phone ? { phone: user.memberProfile.phone } : null
    ])
    .filter(Boolean) as Prisma.PastoralFollowUpWhereInput[];

  const [attendance, chat, direct, orgChat, followUps, giving] = await Promise.all([
    prisma.smartAttendanceRecord.findMany({
      where: { userId: { in: memberIds }, checkedInAt: { gte: since } },
      select: { userId: true }
    }),
    prisma.chatMessage.findMany({
      where: { authorId: { in: memberIds }, createdAt: { gte: since }, deletedAt: null },
      select: { authorId: true }
    }),
    prisma.directMessage.findMany({
      where: { authorId: { in: memberIds }, createdAt: { gte: since }, deletedAt: null },
      select: { authorId: true }
    }),
    prisma.orgChatMessage.findMany({
      where: { authorId: { in: memberIds }, createdAt: { gte: since }, deletedAt: null },
      select: { authorId: true }
    }),
    followUpContactFilters.length
      ? prisma.pastoralFollowUp.findMany({
          where: {
            OR: followUpContactFilters
          },
          select: { email: true, phone: true, status: true, updatedAt: true },
          take: 500
        })
      : Promise.resolve([]),
    prisma.givingReceipt.findMany({
      where: { userId: { in: memberIds }, status: "ACTIVE", receivedAt: { gte: since } },
      select: { userId: true }
    })
  ]);

  const activeIds = new Set<string>();
  attendance.forEach((row) => row.userId && activeIds.add(row.userId));
  chat.forEach((row) => row.authorId && activeIds.add(row.authorId));
  direct.forEach((row) => activeIds.add(row.authorId));
  orgChat.forEach((row) => activeIds.add(row.authorId));
  giving.forEach((row) => row.userId && activeIds.add(row.userId));

  const followUpByEmailOrPhone = new Set(
    followUps.map((followUp) => [followUp.email?.toLowerCase(), followUp.phone].filter(Boolean).join("|"))
  );

  return users
    .filter((user) => !activeIds.has(user.id))
    .map((user) => {
      const followUpKey = [user.email?.toLowerCase(), user.memberProfile?.phone].filter(Boolean).join("|");
      return {
        userId: user.id,
        name: user.name ?? user.email ?? "LETW member",
        email: user.email,
        phone: user.memberProfile?.phone ?? null,
        membershipStatus: user.memberProfile?.membershipStatus ?? "ACTIVE",
        risk: followUpByEmailOrPhone.has(followUpKey) ? "Already in follow-up" : "Needs pastoral follow-up",
        reason: "No attendance, chat, or giving activity recorded in the last 60 days."
      };
    })
    .slice(0, 80);
}

async function leadershipMemberIds(access: LeadershipAccess) {
  if (access.isAdmin) {
    const rows = await prisma.user.findMany({ where: activeUserWhere, select: { id: true }, take: 1000 });
    return rows.map((row) => row.id);
  }

  const workspaceIds = Array.from(new Set([...access.leadershipWorkspaceIds, ...access.openDirectoryWorkspaceIds]));
  const users = await prisma.user.findMany({
    where: {
      ...activeUserWhere,
      OR: [
        { id: access.user.id },
        ...(access.unitIds.length ? [{ memberProfile: { currentOrganizationUnitId: { in: access.unitIds } } }] : []),
        ...(workspaceIds.length ? [{ workspaceMemberships: { some: { workspaceId: { in: workspaceIds } } } }] : [])
      ]
    },
    select: { id: true },
    take: 1000
  });
  return users.map((row) => row.id);
}

export async function getLeadershipSuiteData(userId: string) {
  const access = await requireLeadershipAccess(userId);
  const memberIds = await leadershipMemberIds(access);
  const workspaces = await getLeadershipWorkspaces(access);
  const workspaceIds = workspaces.map((workspace) => workspace.id);
  const unitWhere: Prisma.OrganizationUnitWhereInput = access.isAdmin ? { active: true } : { active: true, id: { in: access.unitIds } };
  const scopedWorkspaceWhere: Prisma.WorkspaceWhereInput = access.isAdmin
    ? { deletedAt: null }
    : { id: { in: workspaceIds }, deletedAt: null };
  const scopedUnitIds = access.isAdmin ? undefined : access.unitIds.length ? access.unitIds : ["__none__"];
  const now = new Date();
  const nextThirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [
    directory,
    units,
    upcomingMilestones,
    silentAbsences,
    servicePlans,
    givingStats,
    givingRecent,
    visitorStats,
    followUpStats,
    upcomingEvents,
    attendanceRecords,
    completedTraining,
    projects,
    openDocumentIssues,
    policyCount,
    commandDrafts,
    leaders,
    workspaceFiles,
    shareLinks,
    aiAgents,
    openTasks
  ] = await Promise.all([
    getLeadershipDirectory(userId),
    prisma.organizationUnit.findMany({
      where: unitWhere,
      select: {
        id: true,
        parentId: true,
        type: true,
        name: true,
        code: true,
        countryCode: true,
        active: true,
        createdAt: true
      },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      take: 300
    }),
    getUpcomingMilestones(access, memberIds),
    detectSilentAbsences(memberIds),
    prisma.servicePlan.findMany({
      where: access.isAdmin
        ? {}
        : {
            OR: [
              { workspaceId: { in: workspaceIds.length ? workspaceIds : ["__none__"] } },
              { organizationUnitId: { in: scopedUnitIds } },
              { coordinatorId: userId },
              { createdById: userId }
            ]
          },
      orderBy: [{ startsAt: "asc" }],
      take: 80
    }),
    prisma.givingReceipt.aggregate({
      where: access.isAdmin
        ? { status: "ACTIVE" }
        : { status: "ACTIVE", OR: [{ userId: { in: memberIds } }, { issuedById: userId }] },
      _sum: { amountCents: true },
      _count: { id: true }
    }),
    prisma.givingReceipt.findMany({
      where: access.isAdmin
        ? {}
        : { OR: [{ userId: { in: memberIds } }, { issuedById: userId }] },
      orderBy: { receivedAt: "desc" },
      take: 12
    }),
    prisma.visitorJourney.groupBy({
      by: ["stage"],
      where: access.isAdmin
        ? {}
        : { OR: [{ workspaceId: { in: workspaceIds.length ? workspaceIds : ["__none__"] } }, { assignedToId: userId }] },
      _count: { id: true }
    }),
    prisma.pastoralFollowUp.groupBy({
      by: ["status"],
      where: access.isAdmin
        ? {}
        : { OR: [{ workspaceId: { in: workspaceIds.length ? workspaceIds : ["__none__"] } }, { assignedToId: userId }] },
      _count: { id: true }
    }),
    prisma.churchEvent.findMany({
      where: access.isAdmin
        ? { startsAt: { gte: now, lte: nextThirtyDays } }
        : {
            startsAt: { gte: now, lte: nextThirtyDays },
            OR: [{ workspaceId: { in: workspaceIds.length ? workspaceIds : ["__none__"] } }]
          },
      orderBy: { startsAt: "asc" },
      take: 30
    }),
    prisma.smartAttendanceRecord.count({
      where: { checkedInAt: { gte: new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000) } }
    }),
    prisma.trainingEnrollment.count({
      where: { status: TrainingEnrollmentStatus.COMPLETED }
    }),
    prisma.churchProject.findMany({
      where: access.isAdmin
        ? {}
        : {
            OR: [
              { workspaceId: { in: workspaceIds.length ? workspaceIds : ["__none__"] } },
              { organizationUnitId: { in: scopedUnitIds } },
              { ownerId: userId }
            ]
          },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
      take: 30
    }),
    prisma.contentFreshnessIssue.findMany({
      where: access.isAdmin ? { status: "OPEN" } : { status: "OPEN", workspaceId: { in: workspaceIds.length ? workspaceIds : ["__none__"] } },
      orderBy: [{ reviewDueAt: "asc" }, { createdAt: "desc" }],
      take: 30
    }),
    prisma.policyDocument.count({
      where: access.isAdmin ? {} : { workspaceId: { in: workspaceIds.length ? workspaceIds : ["__none__"] } }
    }),
    prisma.leadershipCommandDraft.findMany({
      where: access.isAdmin ? {} : { userId },
      orderBy: { createdAt: "desc" },
      take: 12
    }),
    prisma.organizationUnitLeader.findMany({
      where: access.isAdmin ? {} : { unitId: { in: access.unitIds.length ? access.unitIds : ["__none__"] } },
      select: {
        id: true,
        title: true,
        unitId: true,
        userId: true,
        canCreateWorkspaces: true,
        inheritToChildren: true
      },
      take: 120
    }),
    prisma.file.aggregate({ where: { workspace: scopedWorkspaceWhere, deletedAt: null }, _count: { id: true }, _sum: { size: true } }),
    prisma.fileShareLink.count({
      where: {
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        file: { workspace: scopedWorkspaceWhere }
      }
    }),
    prisma.workspaceAiAgent.count({
      where: access.isAdmin
        ? { enabled: true }
        : { enabled: true, OR: [{ workspaceId: { in: workspaceIds.length ? workspaceIds : ["__none__"] } }, { organizationUnitId: { in: scopedUnitIds } }] }
    }),
    prisma.workspaceTask.count({
      where: access.isAdmin
        ? { status: { not: TaskStatus.DONE } }
        : {
            status: { not: TaskStatus.DONE },
            OR: [{ workspaceId: { in: workspaceIds.length ? workspaceIds : ["__none__"] } }, { assignedToId: userId }]
          }
    })
  ]);

  const visitorCounts = Object.fromEntries(visitorStats.map((row) => [row.stage, row._count.id]));
  const followUpCounts = Object.fromEntries(followUpStats.map((row) => [row.status, row._count.id]));
  const completedFollowUps = followUpCounts[FollowUpStatus.COMPLETED] ?? 0;
  const closedFollowUps = followUpCounts[FollowUpStatus.CLOSED] ?? 0;
  const soulsWon =
    (visitorCounts[VisitorJourneyStage.FOUNDATION_CLASS] ?? 0) +
    (visitorCounts[VisitorJourneyStage.MEMBERSHIP_ONBOARDING] ?? 0);
  const baptisms = directory.members.filter((member) => member.profile.baptismAt).length;
  const serviceDecisions = servicePlans.reduce((sum, plan) => sum + (plan.salvationDecisions ?? 0), 0);
  const testimonies = servicePlans.reduce((sum, plan) => sum + (plan.testimoniesCount ?? 0), 0);
  const outreaches = upcomingEvents.filter((event) => event.eventType === ChurchEventType.OUTREACH).length;
  const impactScore =
    soulsWon * 10 +
    serviceDecisions * 10 +
    baptisms * 8 +
    testimonies * 5 +
    (completedFollowUps + closedFollowUps) * 4 +
    completedTraining * 3 +
    outreaches * 6 +
    Math.min(units.length, 100);

  const unitMemberCounts = new Map<string, number>();
  directory.members.forEach((member) => {
    const unitId = member.profile.currentOrganizationUnitId;
    if (unitId) unitMemberCounts.set(unitId, (unitMemberCounts.get(unitId) ?? 0) + 1);
  });
  const eventCountByWorkspace = new Map<string, number>();
  upcomingEvents.forEach((event) => {
    if (event.workspaceId) eventCountByWorkspace.set(event.workspaceId, (eventCountByWorkspace.get(event.workspaceId) ?? 0) + 1);
  });

  const commandMap = units.map((unit) => ({
    id: unit.id,
    name: unit.name,
    type: unit.type,
    code: unit.code,
    countryCode: unit.countryCode,
    parentId: unit.parentId,
    memberCount: unitMemberCounts.get(unit.id) ?? 0,
    leaderCount: leaders.filter((leader) => leader.unitId === unit.id).length,
    active: unit.active
  }));

  const homeMode = access.isAdmin
    ? "Admin command home"
    : access.leadershipAssignments.length
      ? "Branch/department leadership home"
      : "Workspace leadership home";

  await logActivity({
    userId,
    action: "leadership.suite_viewed",
    metadata: { homeMode, memberScope: memberIds.length }
  });

  return {
    access: {
      isAdmin: access.isAdmin,
      canUseLeadership: access.canUseLeadership,
      homeMode,
      unitIds: access.unitIds,
      leadershipWorkspaceIds: access.leadershipWorkspaceIds
    },
    metrics: {
      members: directory.members.length,
      units: units.length,
      workspaces: workspaces.length,
      upcomingMilestones: upcomingMilestones.length,
      silentAbsences: silentAbsences.length,
      activeGivingReceipts: givingStats._count.id,
      givingTotal: givingStats._sum.amountCents ?? 0,
      givingTotalLabel: currency(givingStats._sum.amountCents ?? 0, givingRecent[0]?.currency ?? "GBP"),
      openTasks,
      activeShareLinks: shareLinks,
      aiAgents,
      documents: workspaceFiles._count.id,
      storageBytes: workspaceFiles._sum.size ?? 0,
      impactScore
    },
    workspaces,
    directory: directory.members,
    upcomingMilestones,
    silentAbsences,
    servicePlans,
    givingReceipts: givingRecent,
    visitorCounts,
    followUpCounts,
    upcomingEvents,
    projects,
    documentIssues: openDocumentIssues,
    policyCount,
    commandDrafts,
    commandMap,
    leaders: leaders.map((leader) => ({
      id: leader.id,
      title: leader.title,
      canCreateWorkspaces: leader.canCreateWorkspaces,
      inheritToChildren: leader.inheritToChildren,
      unit: units.find((unit) => unit.id === leader.unitId) ?? null,
      user:
        directory.members.find((member) => member.id === leader.userId) ?? {
          id: leader.userId,
          name: "Leader",
          email: null
        }
    })),
    impact: {
      score: impactScore,
      soulsWon,
      salvationDecisions: serviceDecisions,
      baptisms,
      testimonies,
      followUpsCompleted: completedFollowUps + closedFollowUps,
      workersTrained: completedTraining,
      outreaches,
      attendanceRecords
    }
  };
}

export async function updateWorkspaceAudienceMode(
  actorId: string,
  workspaceId: string,
  audienceMode: WorkspaceAudienceMode,
  memberDirectoryOpen: boolean
) {
  if (!(await hasWorkspaceAdminAccess(actorId, workspaceId))) {
    throw new ApiError(403, "Only workspace admins can update workspace mode and directory visibility.");
  }

  const workspace = await prisma.workspace.update({
    where: { id: workspaceId },
    data: { audienceMode, memberDirectoryOpen },
    select: { id: true, name: true, audienceMode: true, memberDirectoryOpen: true }
  });
  await logActivity({
    userId: actorId,
    workspaceId,
    action: activityActions.workspaceAudienceModeUpdated,
    targetId: workspaceId,
    metadata: { audienceMode, memberDirectoryOpen }
  });
  return workspace;
}

export async function createServicePlan(actorId: string, input: {
  title: string;
  serviceType: ChurchEventType;
  startsAt: string;
  endsAt?: string | null;
  workspaceId?: string | null;
  organizationUnitId?: string | null;
  eventId?: string | null;
  theme?: string | null;
  preacher?: string | null;
  coordinatorId?: string | null;
  orderOfService?: string[];
  ministers?: string[];
  choirSongs?: string[];
  mediaTeam?: string[];
  prayerPoints?: string | null;
}) {
  const access = await requireLeadershipAccess(actorId);
  if (input.workspaceId && !access.isAdmin && !access.leadershipWorkspaceIds.includes(input.workspaceId)) {
    throw new ApiError(403, "You cannot create service plans in this workspace.");
  }
  if (input.organizationUnitId && !access.isAdmin && !access.unitIds.includes(input.organizationUnitId)) {
    throw new ApiError(403, "You cannot create service plans for this branch or department.");
  }

  const plan = await prisma.servicePlan.create({
    data: {
      title: input.title,
      serviceType: input.serviceType,
      startsAt: new Date(input.startsAt),
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      workspaceId: input.workspaceId ?? null,
      organizationUnitId: input.organizationUnitId ?? null,
      eventId: input.eventId ?? null,
      theme: input.theme ?? null,
      preacher: input.preacher ?? null,
      coordinatorId: input.coordinatorId ?? null,
      orderOfService: asJson(input.orderOfService ?? []),
      ministers: asJson(input.ministers ?? []),
      choirSongs: asJson(input.choirSongs ?? []),
      mediaTeam: asJson(input.mediaTeam ?? []),
      prayerPoints: input.prayerPoints ?? null,
      createdById: actorId
    }
  });
  await logActivity({
    userId: actorId,
    workspaceId: input.workspaceId ?? undefined,
    action: activityActions.servicePlanCreated,
    targetId: plan.id,
    metadata: { title: input.title, organizationUnitId: input.organizationUnitId ?? null }
  });
  return plan;
}

export async function updateServicePlan(actorId: string, id: string, input: {
  status?: ServicePlanStatus;
  attendanceTotal?: number | null;
  newVisitors?: number | null;
  salvationDecisions?: number | null;
  testimoniesCount?: number | null;
  offeringSummary?: string | null;
  postServiceReport?: string | null;
}) {
  const existing = await prisma.servicePlan.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Service plan not found.");
  const access = await requireLeadershipAccess(actorId);
  if (
    !access.isAdmin &&
    existing.createdById !== actorId &&
    existing.coordinatorId !== actorId &&
    (!existing.workspaceId || !access.leadershipWorkspaceIds.includes(existing.workspaceId)) &&
    (!existing.organizationUnitId || !access.unitIds.includes(existing.organizationUnitId))
  ) {
    throw new ApiError(403, "You cannot update this service plan.");
  }

  const plan = await prisma.servicePlan.update({
    where: { id },
    data: {
      status: input.status,
      attendanceTotal: input.attendanceTotal,
      newVisitors: input.newVisitors,
      salvationDecisions: input.salvationDecisions,
      testimoniesCount: input.testimoniesCount,
      offeringSummary: input.offeringSummary,
      postServiceReport: input.postServiceReport
    }
  });
  await logActivity({
    userId: actorId,
    workspaceId: existing.workspaceId ?? undefined,
    action: activityActions.servicePlanUpdated,
    targetId: id,
    metadata: { status: input.status ?? existing.status }
  });
  return plan;
}

export async function issueGivingReceipt(actorId: string, input: {
  userId?: string | null;
  donorName: string;
  donorEmail?: string | null;
  donorPhone?: string | null;
  amountCents: number;
  currency: string;
  fund: string;
  paymentMethod?: string | null;
  receivedAt: string;
  notes?: string | null;
}) {
  await requireLeadershipAccess(actorId);
  const receipt = await prisma.givingReceipt.create({
    data: {
      userId: input.userId ?? null,
      donorName: input.donorName,
      donorEmail: input.donorEmail?.toLowerCase() ?? null,
      donorPhone: input.donorPhone ?? null,
      amountCents: input.amountCents,
      currency: input.currency.toUpperCase(),
      fund: input.fund,
      paymentMethod: input.paymentMethod ?? null,
      receivedAt: new Date(input.receivedAt),
      receiptNumber: receiptNumber(),
      qrToken: randomBytes(24).toString("hex"),
      notes: input.notes ?? null,
      issuedById: actorId
    }
  });
  await logActivity({
    userId: actorId,
    action: activityActions.givingReceiptIssued,
    targetId: receipt.id,
    metadata: { receiptNumber: receipt.receiptNumber, fund: receipt.fund, amountCents: receipt.amountCents }
  });
  return receipt;
}

export async function revokeGivingReceipt(actorId: string, id: string, status: "REVOKED" | "VOID" | "ACTIVE") {
  await requireLeadershipAccess(actorId);
  const receipt = await prisma.givingReceipt.update({
    where: { id },
    data:
      status === "ACTIVE"
        ? { status, revokedAt: null, revokedById: null }
        : { status, revokedAt: new Date(), revokedById: actorId }
  });
  await logActivity({
    userId: actorId,
    action: activityActions.givingReceiptRevoked,
    targetId: id,
    metadata: { receiptNumber: receipt.receiptNumber, status }
  });
  return receipt;
}

export async function sendMilestoneReminders(actorId: string) {
  const access = await requireLeadershipAccess(actorId);
  const memberIds = await leadershipMemberIds(access);
  const milestones = await getUpcomingMilestones(access, memberIds);
  const leadersToNotify = access.isAdmin
    ? await prisma.workspaceMember.findMany({
        where: { role: { in: [WorkspaceRole.ADMIN, WorkspaceRole.LEADER] }, workspace: { deletedAt: null } },
        select: { userId: true },
        distinct: ["userId"]
      })
    : [{ userId: actorId }];

  await notifyUsers(leadersToNotify.map((leader) => leader.userId), {
    type: "LEADERSHIP_MILESTONES",
    title: "Upcoming LETW member milestones",
    body: milestones.length
      ? `${milestones.length} birthday, baptism, wedding, membership, or first-visit milestone(s) need attention.`
      : "No member milestones are due in the next 45 days.",
    href: "/dashboard/leadership",
    priority: NotificationPriority.NORMAL
  });
  await logActivity({
    userId: actorId,
    action: activityActions.milestoneReminderSent,
    metadata: { count: milestones.length }
  });
  return { notified: leadersToNotify.length, milestones: milestones.length };
}

export async function runFollowUpAutomation(actorId: string) {
  const access = await requireLeadershipAccess(actorId);
  const now = new Date();
  const overdue = await prisma.visitorJourney.findMany({
    where: {
      stage: { notIn: [VisitorJourneyStage.COMPLETED, VisitorJourneyStage.INACTIVE] },
      ...(access.isAdmin
        ? {}
        : { OR: [{ workspaceId: { in: access.leadershipWorkspaceIds.length ? access.leadershipWorkspaceIds : ["__none__"] } }, { assignedToId: actorId }] }),
      OR: [
        { nextContactAt: { lte: now } },
        { reminderAt: { lte: now } },
        { createdAt: { lte: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) }, assignedToId: { not: null } }
      ]
    },
    take: 100,
    orderBy: [{ reminderAt: "asc" }, { nextContactAt: "asc" }]
  });

  const created = [];
  for (const journey of overdue) {
    const existing = await prisma.pastoralFollowUp.findFirst({
      where: {
        OR: [
          journey.email ? { email: journey.email } : {},
          journey.phone ? { phone: journey.phone } : {}
        ],
        status: { in: [FollowUpStatus.NEW, FollowUpStatus.IN_PROGRESS] }
      }
    });
    if (existing) continue;
    const followUp = await prisma.pastoralFollowUp.create({
      data: {
        workspaceId: journey.workspaceId,
        personName: `${journey.firstName} ${journey.lastName}`.trim(),
        email: journey.email,
        phone: journey.phone,
        reason: `${journey.journeyType.toLowerCase().replace("_", " ")} follow-up from stage ${journey.stage.toLowerCase().replaceAll("_", " ")}`,
        assignedToId: journey.assignedToId ?? actorId,
        nextContactAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        createdById: actorId
      }
    });
    created.push(followUp);
  }

  const assigneeIds = Array.from(new Set(created.map((followUp) => followUp.assignedToId).filter(Boolean) as string[]));
  await notifyUsers(assigneeIds, {
    type: "SMART_FOLLOW_UP",
    title: "Visitor follow-up assigned",
    body: `${created.length} follow-up task(s) were generated from visitor and new-convert journeys.`,
    href: "/dashboard/leadership",
    priority: NotificationPriority.HIGH
  });
  await logActivity({
    userId: actorId,
    action: activityActions.followUpAutomationRun,
    metadata: { reviewed: overdue.length, created: created.length }
  });
  return { reviewed: overdue.length, created: created.length };
}

export async function runDocumentIntelligence(actorId: string) {
  const access = await requireLeadershipAccess(actorId);
  const workspaces = await getLeadershipWorkspaces(access);
  const workspaceIds = workspaces.map((workspace) => workspace.id);
  const now = new Date();
  const staleBefore = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const [files, wikiPages, policies] = await Promise.all([
    prisma.file.findMany({
      where: { deletedAt: null, workspaceId: { in: workspaceIds.length ? workspaceIds : ["__none__"] } },
      select: { id: true, workspaceId: true, fileName: true, uploadedById: true, createdAt: true, updatedAt: true },
      take: 500
    }),
    prisma.wikiPage.findMany({
      where: { workspaceId: { in: workspaceIds.length ? workspaceIds : ["__none__"] } },
      select: { id: true, workspaceId: true, title: true, updatedById: true, updatedAt: true },
      take: 500
    }),
    prisma.policyDocument.findMany({
      where: access.isAdmin ? {} : { workspaceId: { in: workspaceIds.length ? workspaceIds : ["__none__"] } },
      select: { id: true, workspaceId: true, title: true, createdById: true, updatedAt: true, status: true },
      take: 500
    })
  ]);

  const titleCounts = new Map<string, number>();
  [...files.map((file) => file.fileName), ...wikiPages.map((page) => page.title), ...policies.map((policy) => policy.title)].forEach((title) => {
    const key = title.toLowerCase().replace(/\s+/g, " ").trim();
    titleCounts.set(key, (titleCounts.get(key) ?? 0) + 1);
  });

  const issueInputs: Array<{
    sourceType: string;
    sourceId: string;
    workspaceId: string | null;
    issueType: "STALE" | "DUPLICATE" | "MISSING_OWNER" | "REVIEW_DUE";
    title: string;
    details: string;
    ownerId?: string | null;
    lastUpdatedAt?: Date | null;
    reviewDueAt?: Date | null;
  }> = [];

  files.forEach((file) => {
    if (file.updatedAt < staleBefore) {
      issueInputs.push({
        sourceType: "FILE",
        sourceId: file.id,
        workspaceId: file.workspaceId,
        issueType: "STALE",
        title: file.fileName,
        details: "File has not been updated for 180 days. Confirm owner, expiry, and current version.",
        ownerId: file.uploadedById,
        lastUpdatedAt: file.updatedAt,
        reviewDueAt: now
      });
    }
    if ((titleCounts.get(file.fileName.toLowerCase().replace(/\s+/g, " ").trim()) ?? 0) > 1) {
      issueInputs.push({
        sourceType: "FILE",
        sourceId: file.id,
        workspaceId: file.workspaceId,
        issueType: "DUPLICATE",
        title: file.fileName,
        details: "Another knowledge or document item has a matching title. Confirm the correct version.",
        ownerId: file.uploadedById,
        lastUpdatedAt: file.updatedAt
      });
    }
  });

  wikiPages.forEach((page) => {
    if (page.updatedAt < staleBefore) {
      issueInputs.push({
        sourceType: "WIKI",
        sourceId: page.id,
        workspaceId: page.workspaceId,
        issueType: "STALE",
        title: page.title,
        details: "Knowledge page needs freshness review.",
        ownerId: page.updatedById,
        lastUpdatedAt: page.updatedAt,
        reviewDueAt: now
      });
    }
  });

  policies.forEach((policy) => {
    if (policy.updatedAt < staleBefore || policy.status !== "PUBLISHED") {
      issueInputs.push({
        sourceType: "POLICY",
        sourceId: policy.id,
        workspaceId: policy.workspaceId,
        issueType: policy.status === "PUBLISHED" ? "STALE" : "REVIEW_DUE",
        title: policy.title,
        details: policy.status === "PUBLISHED" ? "Policy has not been reviewed recently." : "Policy is not published yet.",
        ownerId: policy.createdById,
        lastUpdatedAt: policy.updatedAt,
        reviewDueAt: now
      });
    }
  });

  for (const issue of issueInputs.slice(0, 200)) {
    await prisma.contentFreshnessIssue.upsert({
      where: {
        sourceType_sourceId_issueType: {
          sourceType: issue.sourceType,
          sourceId: issue.sourceId,
          issueType: issue.issueType
        }
      },
      update: {
        title: issue.title,
        details: issue.details,
        ownerId: issue.ownerId,
        lastUpdatedAt: issue.lastUpdatedAt,
        reviewDueAt: issue.reviewDueAt,
        status: "OPEN"
      },
      create: issue
    });
  }

  await logActivity({
    userId: actorId,
    action: activityActions.documentIntelligenceRun,
    metadata: { issues: issueInputs.length }
  });
  return { issues: issueInputs.length };
}

export async function generateLeadershipReport(actorId: string, prompt: string) {
  const data = await getLeadershipSuiteData(actorId);
  const text = prompt.toLowerCase();
  const lines = [
    "LETW leadership report",
    `Scope: ${data.access.homeMode}`,
    `Members in view: ${data.metrics.members}`,
    `Workspaces: ${data.metrics.workspaces}`,
    `Branches/departments: ${data.metrics.units}`,
    `Kingdom Impact Score: ${data.impact.score}`,
    `Souls/new convert signals: ${data.impact.soulsWon + data.impact.salvationDecisions}`,
    `Baptisms recorded: ${data.impact.baptisms}`,
    `Follow-ups completed: ${data.impact.followUpsCompleted}`,
    `Silent absence risks: ${data.metrics.silentAbsences}`,
    `Upcoming milestones: ${data.metrics.upcomingMilestones}`,
    `Giving receipts: ${data.metrics.activeGivingReceipts} (${data.metrics.givingTotalLabel})`
  ];

  if (text.includes("absence") || text.includes("attend")) {
    lines.push(
      "",
      "Absence attention list:",
      ...data.silentAbsences.slice(0, 12).map((item) => `- ${item.name}: ${item.reason}`)
    );
  }
  if (text.includes("follow")) {
    lines.push("", "Follow-up performance:", JSON.stringify(data.followUpCounts, null, 2));
  }
  if (text.includes("letter") || text.includes("draft")) {
    lines.push(
      "",
      "Draft message:",
      "Dear LETW leaders,",
      "Please review the attached monthly ministry signals, follow up on members requiring care, and update service reports before the next leadership review.",
      "Grace and peace."
    );
  }

  const report = lines.join("\n");
  await prisma.aiAssistantAudit.create({
    data: {
      userId: actorId,
      mode: "LEADERSHIP_REPORT",
      question: prompt,
      workspaceIds: asJson(data.access.leadershipWorkspaceIds),
      sources: asJson(["Member CRM", "Attendance", "Follow-ups", "Service plans", "Giving receipts"]),
      model: process.env.OPENAI_MODEL ?? "local-summary",
      status: "COMPLETED"
    }
  });
  await logActivity({
    userId: actorId,
    action: activityActions.leadershipAiReportGenerated,
    metadata: { prompt: prompt.slice(0, 200) }
  });
  return { report, sources: ["Member CRM", "Attendance", "Follow-ups", "Service plans", "Giving receipts"] };
}

export async function draftLeadershipVoiceCommand(actorId: string, commandText: string) {
  await requireLeadershipAccess(actorId);
  const normalized = commandText.toLowerCase();
  let intent = "GENERAL_ACTION";
  let summary = "Review this leadership command and confirm the exact action before LETW changes any record.";
  const payload: Record<string, unknown> = { original: commandText };

  if (normalized.includes("meeting") || normalized.includes("service")) {
    intent = "CREATE_MEETING_OR_SERVICE";
    summary = "Draft a meeting/service plan. Choose workspace, date, passcode or agenda, then confirm.";
  } else if (normalized.includes("reminder") || normalized.includes("send")) {
    intent = "SEND_REMINDER";
    summary = "Draft a controlled reminder to the selected audience. Confirmation is required before sending.";
  } else if (normalized.includes("follow")) {
    intent = "CREATE_FOLLOW_UP";
    summary = "Draft a pastoral or visitor follow-up task for review.";
  } else if (normalized.includes("report")) {
    intent = "GENERATE_REPORT";
    summary = "Generate a leadership report from authorized LETW records.";
  }

  const draft = await prisma.leadershipCommandDraft.create({
    data: {
      userId: actorId,
      commandText,
      intent,
      summary,
      payload: asJson(payload)
    }
  });
  await logActivity({
    userId: actorId,
    action: activityActions.voiceCommandDrafted,
    targetId: draft.id,
    metadata: { intent }
  });
  return draft;
}
