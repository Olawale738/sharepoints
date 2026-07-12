import { randomBytes } from "crypto";
import {
  ChurchEventType,
  ConfidentialVaultRecordType,
  ConfidentialVaultStatus,
  FollowUpStatus,
  LeadershipDecisionSource,
  LeadershipDecisionStatus,
  LeadershipHandoverStatus,
  MonthlyReportStatus,
  OfficialLetterStatus,
  OfficialLetterType,
  Prisma,
  WorkspaceRole
} from "@prisma/client";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError } from "@/lib/api";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole, requireAnyWorkspacePermission } from "@/lib/rbac";
import { getLeadershipWorkspaces, requireLeadershipAccess } from "@/lib/leadership-suite";

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function listFromText(value?: string[] | string | null) {
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean);
  return (value ?? "")
    .split("\n")
    .flatMap((line) => line.split(","))
    .map((item) => item.trim())
    .filter(Boolean);
}

function monthRange(year: number, month: number) {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1));
  return { start, end };
}

async function descendantUnitIds(rootId?: string | null) {
  if (!rootId) return [];
  const units = await prisma.organizationUnit.findMany({
    where: { active: true },
    select: { id: true, parentId: true }
  });
  const children = new Map<string, string[]>();
  units.forEach((unit) => {
    if (!unit.parentId) return;
    children.set(unit.parentId, [...(children.get(unit.parentId) ?? []), unit.id]);
  });
  const seen = new Set([rootId]);
  const queue = [rootId];
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

async function scopeForReport(input: { organizationUnitId?: string | null; workspaceId?: string | null }) {
  const unitIds = await descendantUnitIds(input.organizationUnitId);
  const workspaceRows = await prisma.workspace.findMany({
    where: {
      deletedAt: null,
      ...(input.workspaceId
        ? { id: input.workspaceId }
        : unitIds.length
          ? { organizationUnitId: { in: unitIds } }
          : {})
    },
    select: { id: true, name: true }
  });
  const workspaceIds = workspaceRows.map((workspace) => workspace.id);
  const memberRows = await prisma.user.findMany({
    where: {
      deletedAt: null,
      suspendedAt: null,
      accessRevokedAt: null,
      ...(unitIds.length
        ? { memberProfile: { currentOrganizationUnitId: { in: unitIds } } }
        : workspaceIds.length
          ? { workspaceMemberships: { some: { workspaceId: { in: workspaceIds } } } }
          : {})
    },
    select: { id: true }
  });
  return {
    unitIds,
    workspaceIds,
    memberIds: memberRows.map((member) => member.id),
    workspaceNames: workspaceRows.map((workspace) => workspace.name)
  };
}

function letterNumber(type: OfficialLetterType) {
  const prefix = type
    .split("_")
    .map((part) => part[0])
    .join("");
  return `LETW-${prefix}-${new Date().getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

type GovernanceScope = {
  workspaceId?: string | null;
  organizationUnitId?: string | null;
  createdById?: string | null;
  generatedById?: string | null;
  issuedById?: string | null;
  participantIds?: Array<string | null | undefined>;
};

export async function requireLeadershipGovernanceScopeAccess(actorId: string, scope: GovernanceScope) {
  const access = await requireLeadershipAccess(actorId);
  if (
    access.isAdmin ||
    scope.createdById === actorId ||
    scope.generatedById === actorId ||
    scope.issuedById === actorId ||
    scope.participantIds?.includes(actorId)
  ) {
    return access;
  }

  const workspaces = await getLeadershipWorkspaces(access);
  const workspaceIds = new Set(workspaces.map((workspace) => workspace.id));
  const hasWorkspaceAccess = Boolean(scope.workspaceId && workspaceIds.has(scope.workspaceId));
  const hasUnitAccess = Boolean(scope.organizationUnitId && access.unitIds.includes(scope.organizationUnitId));

  if (hasWorkspaceAccess || hasUnitAccess) return access;

  throw new ApiError(403, "You do not have permission to manage this leadership governance record.");
}

export async function canUseConfidentialVault(userId: string) {
  if (await hasAnyWorkspaceAdminRole(userId)) return true;
  const [leader, user] = await Promise.all([
    prisma.organizationUnitLeader.findFirst({
      where: {
        userId,
        OR: [
          { title: { contains: "pastor", mode: "insensitive" } },
          { title: { contains: "president", mode: "insensitive" } },
          { title: { contains: "overseer", mode: "insensitive" } },
          { title: { contains: "board", mode: "insensitive" } }
        ]
      },
      select: { id: true }
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        category: true,
        memberProfile: { select: { organizationPosition: true } }
      }
    })
  ]);
  const label = `${user?.category ?? ""} ${user?.memberProfile?.organizationPosition ?? ""}`.toLowerCase();
  return Boolean(leader || label.includes("pastor") || label.includes("president") || label.includes("overseer"));
}

export async function requireConfidentialVaultAccess(userId: string) {
  if (!(await canUseConfidentialVault(userId))) {
    throw new ApiError(403, "Only authorized top pastors and administrators can open the confidential prayer and counselling vault.");
  }
}

export async function getLeadershipGovernanceData(userId: string) {
  const access = await requireLeadershipAccess(userId);
  const [workspaces, users, units, canOpenVault] = await Promise.all([
    getLeadershipWorkspaces(access),
    prisma.user.findMany({
      where: { deletedAt: null, suspendedAt: null, accessRevokedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        category: true,
        memberProfile: { select: { organizationPosition: true, membershipNumber: true } }
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      take: 600
    }),
    prisma.organizationUnit.findMany({
      where: access.isAdmin ? { active: true } : { active: true, id: { in: access.unitIds.length ? access.unitIds : ["__none__"] } },
      select: { id: true, name: true, type: true, parentId: true, countryCode: true, code: true },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      take: 300
    }),
    canUseConfidentialVault(userId)
  ]);
  const workspaceIds = workspaces.map((workspace) => workspace.id);
  const unitIds = units.map((unit) => unit.id);
  const scopeWhere = access.isAdmin
    ? {}
    : {
        OR: [
          { workspaceId: { in: workspaceIds.length ? workspaceIds : ["__none__"] } },
          { organizationUnitId: { in: unitIds.length ? unitIds : ["__none__"] } },
          { createdById: userId }
        ]
      };

  const [decisions, reports, vaultRecords, vaultLogs, handovers, letters, boardRecords] = await Promise.all([
    prisma.leadershipDecision.findMany({
      where: scopeWhere,
      orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      take: 300
    }),
    prisma.monthlyMinistryReport.findMany({
      where: scopeWhere,
      orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
      take: 120
    }),
    canOpenVault
      ? prisma.confidentialVaultRecord.findMany({
          where: scopeWhere,
          select: {
            id: true,
            workspaceId: true,
            organizationUnitId: true,
            recordType: true,
            title: true,
            subjectName: true,
            subjectUserId: true,
            sensitivity: true,
            assignedToId: true,
            status: true,
            createdById: true,
            closedAt: true,
            createdAt: true,
            updatedAt: true
          },
          orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
          take: 200
        })
      : Promise.resolve([]),
    canOpenVault
      ? prisma.confidentialVaultAccessLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 100
        })
      : Promise.resolve([]),
    prisma.leadershipHandover.findMany({
      where: access.isAdmin
        ? {}
        : {
            OR: [
              { workspaceId: { in: workspaceIds.length ? workspaceIds : ["__none__"] } },
              { organizationUnitId: { in: unitIds.length ? unitIds : ["__none__"] } },
              { fromLeaderId: userId },
              { toLeaderId: userId },
              { createdById: userId }
            ]
          },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200
    }),
    prisma.officialLetter.findMany({
      where: scopeWhere,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 200
    }),
    prisma.boardRecord.findMany({
      where: scopeWhere,
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 80
    })
  ]);

  return {
    access: {
      isAdmin: access.isAdmin,
      canOpenVault
    },
    workspaces,
    units,
    users,
    decisions,
    reports,
    vaultRecords,
    vaultLogs,
    handovers,
    letters,
    boardRecords,
    metrics: {
      pendingDecisions: decisions.filter((decision) => decision.status === "PENDING" || decision.status === "DELAYED").length,
      reports: reports.length,
      openVaultRecords: vaultRecords.filter((record) => record.status === "OPEN" || record.status === "ACTIVE").length,
      pendingHandovers: handovers.filter((handover) => handover.status !== "COMPLETED" && handover.status !== "CANCELLED").length,
      issuedLetters: letters.filter((letter) => letter.status === "ISSUED").length
    }
  };
}

export async function createLeadershipDecision(actorId: string, input: {
  source: LeadershipDecisionSource;
  title: string;
  description: string;
  meetingNotes?: string | null;
  attachments?: string[] | string | null;
  responsibleUserId?: string | null;
  decidedById?: string | null;
  workspaceId?: string | null;
  organizationUnitId?: string | null;
  dueAt?: string | null;
}) {
  await requireLeadershipGovernanceScopeAccess(actorId, input);
  const decision = await prisma.leadershipDecision.create({
    data: {
      source: input.source,
      title: input.title,
      description: input.description,
      meetingNotes: input.meetingNotes ?? null,
      attachments: asJson(listFromText(input.attachments)),
      responsibleUserId: input.responsibleUserId ?? null,
      decidedById: input.decidedById ?? null,
      workspaceId: input.workspaceId ?? null,
      organizationUnitId: input.organizationUnitId ?? null,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      createdById: actorId
    }
  });
  if (decision.responsibleUserId) {
    await notifyUsers([decision.responsibleUserId], {
      type: "LEADERSHIP_DECISION",
      title: "Leadership decision assigned",
      body: decision.title,
      href: "/dashboard/leadership-governance"
    });
  }
  await logActivity({
    userId: actorId,
    workspaceId: decision.workspaceId ?? undefined,
    action: activityActions.leadershipDecisionCreated,
    targetId: decision.id,
    metadata: { source: decision.source, status: decision.status }
  });
  return decision;
}

export async function updateLeadershipDecision(actorId: string, id: string, status: LeadershipDecisionStatus) {
  const existing = await prisma.leadershipDecision.findUnique({
    where: { id },
    select: { workspaceId: true, organizationUnitId: true, createdById: true }
  });
  if (!existing) throw new ApiError(404, "Leadership decision not found.");
  await requireLeadershipGovernanceScopeAccess(actorId, existing);
  const decision = await prisma.leadershipDecision.update({
    where: { id },
    data: {
      status,
      implementedAt: status === "IMPLEMENTED" ? new Date() : undefined
    }
  });
  await logActivity({
    userId: actorId,
    workspaceId: decision.workspaceId ?? undefined,
    action: activityActions.leadershipDecisionUpdated,
    targetId: id,
    metadata: { status }
  });
  return decision;
}

export async function generateMonthlyReport(actorId: string, input: {
  month: number;
  year: number;
  organizationUnitId?: string | null;
  workspaceId?: string | null;
}) {
  await requireLeadershipGovernanceScopeAccess(actorId, input);
  const { start, end } = monthRange(input.year, input.month);
  const scope = await scopeForReport(input);
  const unit = input.organizationUnitId
    ? await prisma.organizationUnit.findUnique({ where: { id: input.organizationUnitId }, select: { name: true, type: true } })
    : null;
  const workspace = input.workspaceId
    ? await prisma.workspace.findUnique({ where: { id: input.workspaceId }, select: { name: true } })
    : null;
  const eventWhere: Prisma.ChurchEventWhereInput = {
    startsAt: { gte: start, lt: end },
    ...(scope.workspaceIds.length ? { workspaceId: { in: scope.workspaceIds } } : {})
  };
  const scopedOr = [
    ...(scope.workspaceIds.length ? [{ workspaceId: { in: scope.workspaceIds } }] : []),
    ...(scope.unitIds.length ? [{ organizationUnitId: { in: scope.unitIds } }] : [])
  ];
  const events = await prisma.churchEvent.findMany({
    where: eventWhere,
    select: { id: true, title: true, eventType: true, startsAt: true },
    take: 250
  });
  const eventIds = events.map((event) => event.id);
  const [attendance, smartSessions, visitors, baptisms, giving, projects, followUps, files, decisions] = await Promise.all([
    eventIds.length
      ? prisma.churchAttendance.count({ where: { checkedInAt: { gte: start, lt: end }, eventId: { in: eventIds } } })
      : Promise.resolve(0),
    prisma.smartAttendanceSession.findMany({
      where: {
        createdAt: { gte: start, lt: end },
        ...(scopedOr.length ? { OR: scopedOr } : {})
      },
      select: { id: true }
    }),
    prisma.visitorJourney.count({
      where: {
        journeyType: "NEW_CONVERT",
        createdAt: { gte: start, lt: end },
        ...(scope.workspaceIds.length ? { workspaceId: { in: scope.workspaceIds } } : {})
      }
    }),
    prisma.memberProfile.count({
      where: {
        baptismAt: { gte: start, lt: end },
        ...(scope.unitIds.length ? { currentOrganizationUnitId: { in: scope.unitIds } } : {})
      }
    }),
    prisma.givingReceipt.aggregate({
      where: {
        status: "ACTIVE",
        receivedAt: { gte: start, lt: end },
        ...(scope.memberIds.length ? { userId: { in: scope.memberIds } } : {})
      },
      _sum: { amountCents: true },
      _count: { id: true }
    }),
    prisma.churchProject.findMany({
      where: {
        ...(scopedOr.length ? { OR: scopedOr } : {})
      },
      select: { id: true, name: true, status: true, dueAt: true },
      take: 100
    }),
    prisma.pastoralFollowUp.groupBy({
      by: ["status"],
      where: {
        createdAt: { gte: start, lt: end },
        ...(scope.workspaceIds.length ? { workspaceId: { in: scope.workspaceIds } } : {})
      },
      _count: { id: true }
    }),
    prisma.file.count({
      where: {
        deletedAt: null,
        createdAt: { gte: start, lt: end },
        ...(scope.workspaceIds.length ? { workspaceId: { in: scope.workspaceIds } } : {})
      }
    }),
    prisma.leadershipDecision.count({
      where: {
        createdAt: { gte: start, lt: end },
        ...(scopedOr.length ? { OR: scopedOr } : {})
      }
    })
  ]);
  const smartAttendance = smartSessions.length
    ? await prisma.smartAttendanceRecord.count({ where: { sessionId: { in: smartSessions.map((session) => session.id) } } })
    : 0;
  const completedFollowUps = followUps
    .filter((row) => row.status === FollowUpStatus.COMPLETED || row.status === FollowUpStatus.CLOSED)
    .reduce((sum, row) => sum + row._count.id, 0);
  const totalFollowUps = followUps.reduce((sum, row) => sum + row._count.id, 0);
  const followUpCompletionRate = totalFollowUps ? Math.round((completedFollowUps / totalFollowUps) * 100) : 0;
  const totalAttendance = attendance + smartAttendance;
  const activeProjects = projects.filter((project) => !["COMPLETED", "CANCELLED"].includes(project.status));
  const overdueProjects = activeProjects.filter((project) => project.dueAt && project.dueAt < end).length;
  const risks = [
    totalAttendance === 0 ? "No attendance was recorded this month." : null,
    completedFollowUps === 0 ? "No completed follow-ups were recorded this month." : null,
    overdueProjects ? "Some projects are overdue or need review." : null,
    decisions === 0 ? "No leadership decisions were logged for this scope." : null
  ].filter((risk): risk is string => Boolean(risk));
  const label = unit ? `${unit.type.toLowerCase()} ${unit.name}` : workspace ? workspace.name : "LETW organization";
  const periodLabel = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(start);
  const metrics = {
    events: events.length,
    services: events.filter((event) => event.eventType === ChurchEventType.SERVICE).length,
    attendance: totalAttendance,
    soulsWon: visitors,
    baptisms,
    givingReceipts: giving._count.id,
    givingAmountCents: giving._sum.amountCents ?? 0,
    projects: projects.length,
    activeProjects: activeProjects.length,
    overdueProjects,
    followUpsTotal: totalFollowUps,
    followUpsCompleted: completedFollowUps,
    followUpCompletionRate,
    documentsAdded: files,
    decisions
  };
  const recommendations = [
    totalAttendance === 0 ? "Confirm that attendance scanners or manual attendance records are being used consistently." : null,
    completedFollowUps === 0 ? "Assign follow-up owners and review new-convert/visitor care every week until closure improves." : null,
    overdueProjects ? "Hold a project review meeting for overdue work, assign owners, and record revised deadlines." : null,
    decisions === 0 ? "Record major leadership decisions in LETW so accountability and history remain searchable." : null,
    risks.length === 0 ? "Maintain the current operating rhythm and capture testimonies, blockers, and next-month goals." : null
  ].filter((recommendation): recommendation is string => Boolean(recommendation));
  const operatingHighlights = [
    `${events.length} event(s) and ${events.filter((event) => event.eventType === ChurchEventType.SERVICE).length} service(s) were captured.`,
    `${totalAttendance} attendance/check-in record(s) were recorded across available sources.`,
    `${visitors} new-convert signal(s), ${baptisms} baptism record(s), and ${completedFollowUps} completed follow-up(s) were found.`,
    `${files} document(s) and ${decisions} leadership decision(s) were added in this reporting scope.`
  ];
  const riskRegister = risks.map((risk, index) => ({
    id: index + 1,
    risk,
    severity: risk.includes("No") ? "High" : "Medium",
    action: "Assign an owner, agree a due date, and review in the next leadership meeting."
  }));
  const summary = [
    `Executive monthly report for ${label}, ${periodLabel}.`,
    `Recorded ${events.length} event(s), ${totalAttendance} attendance/check-in record(s), ${visitors} new-convert signal(s), and ${baptisms} baptism record(s).`,
    `Giving receipts totalled ${(giving._sum.amountCents ?? 0) / 100} from ${giving._count.id} active receipt(s).`,
    risks.length ? `Management attention required: ${risks.join(" ")}` : "No critical report risk was detected from the available data."
  ].join("\n");
  const report = await prisma.monthlyMinistryReport.create({
    data: {
      workspaceId: input.workspaceId ?? null,
      organizationUnitId: input.organizationUnitId ?? null,
      month: input.month,
      year: input.year,
      title: `Monthly report - ${label} - ${input.year}-${String(input.month).padStart(2, "0")}`,
      summary,
      metrics: asJson(metrics),
      risks: asJson(risks),
      sourceSnapshot: asJson({
        workspaceIds: scope.workspaceIds,
        unitIds: scope.unitIds,
        memberCount: scope.memberIds.length,
        workspaceNames: scope.workspaceNames,
        executive: {
          scopeLabel: label,
          periodLabel,
          preparedFor: "LETW executive leadership",
          reportStandard: "LETW Executive Ministry Performance Report",
          conclusion: risks.length
            ? "This period requires leadership review because one or more operating controls need attention."
            : "This period is stable based on available LETW records."
        },
        operatingHighlights,
        recommendations,
        riskRegister,
        assurance: [
          "Generated from authorized LETW SharePoint records.",
          "Scope includes permitted branch, ministry, workspace, attendance, giving, follow-up, file, and decision records.",
          "Figures reflect records available in the system at generation time."
        ]
      }),
      generatedById: actorId
    }
  });
  await logActivity({
    userId: actorId,
    workspaceId: report.workspaceId ?? undefined,
    action: activityActions.monthlyReportGenerated,
    targetId: report.id,
    metadata: { month: input.month, year: input.year, organizationUnitId: input.organizationUnitId ?? null }
  });
  return report;
}

export async function updateMonthlyReportStatus(actorId: string, id: string, status: MonthlyReportStatus) {
  const existing = await prisma.monthlyMinistryReport.findUnique({
    where: { id },
    select: { workspaceId: true, organizationUnitId: true, generatedById: true }
  });
  if (!existing) throw new ApiError(404, "Monthly report not found.");
  await requireLeadershipGovernanceScopeAccess(actorId, existing);
  const report = await prisma.monthlyMinistryReport.update({
    where: { id },
    data: {
      status,
      finalizedAt: status === "FINAL" ? new Date() : undefined
    }
  });
  await logActivity({
    userId: actorId,
    workspaceId: report.workspaceId ?? undefined,
    action: activityActions.monthlyReportUpdated,
    targetId: report.id,
    metadata: { status }
  });
  return report;
}

export async function deleteMonthlyReport(actorId: string, id: string) {
  const existing = await prisma.monthlyMinistryReport.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      month: true,
      year: true,
      workspaceId: true,
      organizationUnitId: true,
      generatedById: true,
      status: true
    }
  });
  if (!existing) throw new ApiError(404, "Monthly report not found.");
  await requireLeadershipGovernanceScopeAccess(actorId, existing);
  await requireAnyWorkspacePermission(actorId, "canDeleteReports", "Only admins or permitted leaders can delete executive reports.");
  await prisma.monthlyMinistryReport.delete({ where: { id } });
  await logActivity({
    userId: actorId,
    workspaceId: existing.workspaceId ?? undefined,
    action: activityActions.monthlyReportDeleted,
    targetId: id,
    metadata: {
      title: existing.title,
      month: existing.month,
      year: existing.year,
      status: existing.status,
      organizationUnitId: existing.organizationUnitId ?? null
    }
  });
  return existing;
}

export async function clearMonthlyReportLogs(actorId: string, id: string) {
  const existing = await prisma.monthlyMinistryReport.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      workspaceId: true,
      organizationUnitId: true,
      generatedById: true
    }
  });
  if (!existing) throw new ApiError(404, "Monthly report not found.");
  await requireLeadershipGovernanceScopeAccess(actorId, existing);
  await requireAnyWorkspacePermission(actorId, "canClearReportLogs", "Only admins or permitted leaders can clear report logs.");
  const actor = await prisma.user.findUnique({ where: { id: actorId }, select: { email: true } });
  const deleted = await prisma.activityLog.deleteMany({
    where: {
      targetId: id,
      action: {
        in: [
          activityActions.monthlyReportGenerated,
          activityActions.monthlyReportUpdated,
          activityActions.monthlyReportDeleted,
          activityActions.monthlyReportLogsCleared
        ]
      }
    }
  });
  await prisma.securityEvent.create({
    data: {
      userId: actorId,
      email: actor?.email ?? null,
      type: "ACTIVITY_LOGS_CLEARED",
      metadata: {
        scope: "MONTHLY_REPORT",
        reportId: id,
        reportTitle: existing.title,
        clearedCount: deleted.count
      }
    }
  });
  return { ...existing, clearedCount: deleted.count };
}

export async function generateMonthlyReportPack(actorId: string, input: { month: number; year: number }) {
  const access = await requireLeadershipAccess(actorId);
  const units = await prisma.organizationUnit.findMany({
    where: {
      active: true,
      type: { in: ["BRANCH", "CHURCH", "MINISTRY"] },
      ...(access.isAdmin ? {} : { id: { in: access.unitIds.length ? access.unitIds : ["__none__"] } })
    },
    select: { id: true },
    take: 80
  });
  const reports = [];
  if (!units.length) {
    reports.push(await generateMonthlyReport(actorId, input));
  } else {
    for (const unit of units) {
      reports.push(await generateMonthlyReport(actorId, { ...input, organizationUnitId: unit.id }));
    }
  }
  return reports;
}

export async function createConfidentialVaultRecord(actorId: string, input: {
  recordType: ConfidentialVaultRecordType;
  title: string;
  subjectName: string;
  subjectUserId?: string | null;
  body: string;
  prayerPoints?: string | null;
  assignedToId?: string | null;
  workspaceId?: string | null;
  organizationUnitId?: string | null;
}) {
  await requireConfidentialVaultAccess(actorId);
  await requireLeadershipGovernanceScopeAccess(actorId, input);
  const record = await prisma.confidentialVaultRecord.create({
    data: {
      recordType: input.recordType,
      title: input.title,
      subjectName: input.subjectName,
      subjectUserId: input.subjectUserId ?? null,
      body: input.body,
      prayerPoints: input.prayerPoints ?? null,
      assignedToId: input.assignedToId ?? null,
      workspaceId: input.workspaceId ?? null,
      organizationUnitId: input.organizationUnitId ?? null,
      createdById: actorId
    }
  });
  await logActivity({
    userId: actorId,
    workspaceId: record.workspaceId ?? undefined,
    action: activityActions.confidentialVaultRecordCreated,
    targetId: record.id,
    metadata: { recordType: record.recordType, sensitivity: record.sensitivity }
  });
  return record;
}

export async function openConfidentialVaultRecord(actorId: string, id: string, request?: Request) {
  await requireConfidentialVaultAccess(actorId);
  const record = await prisma.confidentialVaultRecord.findUnique({ where: { id } });
  if (!record) throw new ApiError(404, "Confidential vault record not found.");
  await requireLeadershipGovernanceScopeAccess(actorId, record);
  await prisma.confidentialVaultAccessLog.create({
    data: {
      recordId: id,
      userId: actorId,
      action: "OPEN",
      ipAddress: request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: request?.headers.get("user-agent") ?? null
    }
  });
  await logActivity({
    userId: actorId,
    workspaceId: record.workspaceId ?? undefined,
    action: activityActions.confidentialVaultRecordOpened,
    targetId: id,
    metadata: { recordType: record.recordType }
  });
  return record;
}

export async function updateConfidentialVaultStatus(actorId: string, id: string, status: ConfidentialVaultStatus) {
  await requireConfidentialVaultAccess(actorId);
  const existing = await prisma.confidentialVaultRecord.findUnique({
    where: { id },
    select: { workspaceId: true, organizationUnitId: true, createdById: true }
  });
  if (!existing) throw new ApiError(404, "Confidential vault record not found.");
  await requireLeadershipGovernanceScopeAccess(actorId, existing);
  const record = await prisma.confidentialVaultRecord.update({
    where: { id },
    data: {
      status,
      closedAt: status === "CLOSED" || status === "ARCHIVED" ? new Date() : null
    }
  });
  await logActivity({ userId: actorId, action: activityActions.confidentialVaultRecordUpdated, targetId: id, metadata: { status } });
  return record;
}

export async function createLeadershipHandover(actorId: string, input: {
  fromLeaderId: string;
  toLeaderId?: string | null;
  title: string;
  reason?: string | null;
  duties?: string[] | string | null;
  documents?: string[] | string | null;
  passwordAssets?: string[] | string | null;
  pendingTasks?: string[] | string | null;
  branchRecords?: string[] | string | null;
  workspaceId?: string | null;
  organizationUnitId?: string | null;
}) {
  await requireLeadershipGovernanceScopeAccess(actorId, input);
  const handover = await prisma.leadershipHandover.create({
    data: {
      fromLeaderId: input.fromLeaderId,
      toLeaderId: input.toLeaderId ?? null,
      title: input.title,
      reason: input.reason ?? null,
      duties: asJson(listFromText(input.duties)),
      documents: asJson(listFromText(input.documents)),
      passwordAssets: asJson(listFromText(input.passwordAssets)),
      pendingTasks: asJson(listFromText(input.pendingTasks)),
      branchRecords: asJson(listFromText(input.branchRecords)),
      workspaceId: input.workspaceId ?? null,
      organizationUnitId: input.organizationUnitId ?? null,
      createdById: actorId
    }
  });
  const notifyIds = [handover.fromLeaderId, handover.toLeaderId].filter(Boolean) as string[];
  await notifyUsers(notifyIds, {
    type: "LEADERSHIP_HANDOVER",
    title: "Leadership handover created",
    body: handover.title,
    href: "/dashboard/leadership-governance"
  });
  await logActivity({ userId: actorId, action: activityActions.leadershipHandoverCreated, targetId: handover.id, metadata: { status: handover.status } });
  return handover;
}

export async function updateLeadershipHandover(actorId: string, id: string, status: LeadershipHandoverStatus) {
  const existing = await prisma.leadershipHandover.findUnique({
    where: { id },
    select: {
      workspaceId: true,
      organizationUnitId: true,
      createdById: true,
      fromLeaderId: true,
      toLeaderId: true
    }
  });
  if (!existing) throw new ApiError(404, "Leadership handover not found.");
  await requireLeadershipGovernanceScopeAccess(actorId, {
    ...existing,
    participantIds: [existing.fromLeaderId, existing.toLeaderId]
  });
  const handover = await prisma.leadershipHandover.update({
    where: { id },
    data: {
      status,
      acceptedAt: status === "ACCEPTED" ? new Date() : undefined,
      completedAt: status === "COMPLETED" ? new Date() : undefined
    }
  });
  await logActivity({ userId: actorId, action: activityActions.leadershipHandoverUpdated, targetId: id, metadata: { status } });
  return handover;
}

export async function createOfficialLetter(actorId: string, input: {
  letterType: OfficialLetterType;
  title: string;
  recipientName: string;
  recipientEmail?: string | null;
  recipientUserId?: string | null;
  body: string;
  signatureName?: string | null;
  workspaceId?: string | null;
  organizationUnitId?: string | null;
  issueNow?: boolean;
}) {
  await requireLeadershipGovernanceScopeAccess(actorId, input);
  const letter = await prisma.officialLetter.create({
    data: {
      letterType: input.letterType,
      letterNumber: letterNumber(input.letterType),
      title: input.title,
      recipientName: input.recipientName,
      recipientEmail: input.recipientEmail ?? null,
      recipientUserId: input.recipientUserId ?? null,
      body: input.body,
      signatureName: input.signatureName || "Olawale N Sanni",
      workspaceId: input.workspaceId ?? null,
      organizationUnitId: input.organizationUnitId ?? null,
      status: input.issueNow ? "ISSUED" : "DRAFT",
      issuedAt: input.issueNow ? new Date() : null,
      issuedById: actorId
    }
  });
  await logActivity({ userId: actorId, action: activityActions.officialLetterCreated, targetId: letter.id, metadata: { letterType: letter.letterType, status: letter.status } });
  return letter;
}

export async function updateOfficialLetter(actorId: string, id: string, status: OfficialLetterStatus) {
  const existing = await prisma.officialLetter.findUnique({
    where: { id },
    select: { workspaceId: true, organizationUnitId: true, issuedById: true, recipientUserId: true }
  });
  if (!existing) throw new ApiError(404, "Official letter not found.");
  await requireLeadershipGovernanceScopeAccess(actorId, {
    ...existing,
    participantIds: [existing.recipientUserId]
  });
  const letter = await prisma.officialLetter.update({
    where: { id },
    data: {
      status,
      issuedAt: status === "ISSUED" ? new Date() : undefined,
      revokedAt: status === "REVOKED" ? new Date() : null
    }
  });
  await logActivity({ userId: actorId, action: activityActions.officialLetterUpdated, targetId: id, metadata: { status } });
  return letter;
}

export async function deleteOfficialLetter(actorId: string, id: string) {
  const existing = await prisma.officialLetter.findUnique({
    where: { id },
    select: {
      id: true,
      letterNumber: true,
      workspaceId: true,
      organizationUnitId: true,
      issuedById: true,
      recipientUserId: true,
      status: true
    }
  });
  if (!existing) throw new ApiError(404, "Official letter not found.");
  await requireLeadershipGovernanceScopeAccess(actorId, {
    ...existing,
    participantIds: [existing.recipientUserId]
  });
  await prisma.officialLetter.delete({ where: { id } });
  await logActivity({
    userId: actorId,
    workspaceId: existing.workspaceId ?? undefined,
    action: activityActions.officialLetterDeleted,
    targetId: id,
    metadata: { letterNumber: existing.letterNumber, status: existing.status }
  });
  return existing;
}

export function canOpenGovernanceFromShell(workspaces: Array<{ role: string }>) {
  const governanceRoles = new Set<string>([WorkspaceRole.ADMIN, WorkspaceRole.LEADER, WorkspaceRole.MODERATOR]);
  return workspaces.some((workspace) => governanceRoles.has(workspace.role));
}
