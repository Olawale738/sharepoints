import { prisma } from "@/lib/prisma";

function add(map: Map<string, number>, key?: string | null, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + amount);
}

function clampScore(value: number, max: number) {
  return Math.max(0, Math.min(max, Math.round(value)));
}

function memberTarget(type: string) {
  if (type === "GLOBAL") return 120;
  if (type === "COUNTRY") return 80;
  if (type === "REGION") return 45;
  if (type === "BRANCH") return 25;
  if (type === "CHURCH") return 20;
  return 12;
}

function grade(score: number) {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "Needs attention";
}

export type BranchHealthScore = Awaited<ReturnType<typeof getBranchHealthScores>>["scores"][number];

export async function getBranchHealthScores() {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000);
  const [units, leaders, profiles, workspaces, projects, attendanceSessions, counsellingCases, safeguardingCases, transfers, expiryItems] =
    await Promise.all([
      prisma.organizationUnit.findMany({
        where: { active: true },
        orderBy: [{ type: "asc" }, { name: "asc" }],
        take: 1000
      }),
      prisma.organizationUnitLeader.findMany({
        select: { id: true, unitId: true, userId: true, title: true, canCreateWorkspaces: true },
        take: 2000
      }),
      prisma.memberProfile.findMany({
        select: {
          currentOrganizationUnitId: true,
          membershipStatus: true,
          phone: true,
          organizationPosition: true,
          membershipNumber: true
        },
        take: 20000
      }),
      prisma.workspace.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          organizationUnitId: true,
          _count: { select: { members: true, files: true, meetings: true } }
        },
        take: 5000
      }),
      prisma.churchProject.findMany({
        select: {
          id: true,
          organizationUnitId: true,
          status: true,
          dueAt: true,
          completedAt: true
        },
        take: 5000
      }),
      prisma.smartAttendanceSession.findMany({
        select: { id: true, organizationUnitId: true, startsAt: true, active: true },
        take: 5000
      }),
      prisma.counsellingCase.findMany({
        select: { id: true, organizationUnitId: true, status: true, sensitivity: true },
        take: 3000
      }),
      prisma.safeguardingCase.findMany({
        select: { id: true, organizationUnitId: true, status: true, severity: true },
        take: 3000
      }),
      prisma.branchTransferRequest.findMany({
        select: { id: true, fromUnitId: true, toUnitId: true, status: true },
        take: 3000
      }),
      prisma.documentExpiryItem.findMany({
        select: { id: true, status: true, reviewDueAt: true, expiresAt: true, workspaceId: true },
        take: 3000
      })
    ]);
  const recentSessionIds = attendanceSessions
    .filter((session) => !session.startsAt || session.startsAt >= ninetyDaysAgo)
    .map((session) => session.id);
  const attendanceRecords = recentSessionIds.length
    ? await prisma.smartAttendanceRecord.findMany({
        where: {
          sessionId: { in: recentSessionIds },
          checkedInAt: { gte: ninetyDaysAgo }
        },
        select: { sessionId: true },
        take: 50000
      })
    : [];

  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const workspaceUnitById = new Map(workspaces.map((workspace) => [workspace.id, workspace.organizationUnitId]));
  const leadersByUnit = new Map<string, number>();
  const workspaceCreatorsByUnit = new Map<string, number>();
  const membersByUnit = new Map<string, number>();
  const activeMembersByUnit = new Map<string, number>();
  const completeProfilesByUnit = new Map<string, number>();
  const workspacesByUnit = new Map<string, number>();
  const workspaceMembersByUnit = new Map<string, number>();
  const filesByUnit = new Map<string, number>();
  const meetingsByUnit = new Map<string, number>();
  const projectsByUnit = new Map<string, number>();
  const completedProjectsByUnit = new Map<string, number>();
  const overdueProjectsByUnit = new Map<string, number>();
  const recentSessionsByUnit = new Map<string, number>();
  const recentAttendanceByUnit = new Map<string, number>();
  const openCareCasesByUnit = new Map<string, number>();
  const highRiskCasesByUnit = new Map<string, number>();
  const pendingTransfersByUnit = new Map<string, number>();
  const renewalRisksByUnit = new Map<string, number>();

  for (const leader of leaders) {
    add(leadersByUnit, leader.unitId);
    if (leader.canCreateWorkspaces) add(workspaceCreatorsByUnit, leader.unitId);
  }
  for (const profile of profiles) {
    add(membersByUnit, profile.currentOrganizationUnitId);
    if (profile.membershipStatus === "ACTIVE") add(activeMembersByUnit, profile.currentOrganizationUnitId);
    if (profile.phone && profile.organizationPosition && profile.membershipNumber) add(completeProfilesByUnit, profile.currentOrganizationUnitId);
  }
  for (const workspace of workspaces) {
    add(workspacesByUnit, workspace.organizationUnitId);
    add(workspaceMembersByUnit, workspace.organizationUnitId, workspace._count.members);
    add(filesByUnit, workspace.organizationUnitId, workspace._count.files);
    add(meetingsByUnit, workspace.organizationUnitId, workspace._count.meetings);
  }
  for (const project of projects) {
    add(projectsByUnit, project.organizationUnitId);
    if (project.status === "COMPLETED") add(completedProjectsByUnit, project.organizationUnitId);
    if (project.dueAt && project.dueAt < now && !["COMPLETED", "CANCELLED"].includes(project.status)) {
      add(overdueProjectsByUnit, project.organizationUnitId);
    }
  }
  for (const session of attendanceSessions) {
    if (!session.startsAt || session.startsAt >= ninetyDaysAgo) add(recentSessionsByUnit, session.organizationUnitId);
  }
  const sessionUnitById = new Map(attendanceSessions.map((session) => [session.id, session.organizationUnitId]));
  for (const record of attendanceRecords) {
    add(recentAttendanceByUnit, sessionUnitById.get(record.sessionId));
  }
  for (const item of counsellingCases) {
    if (item.status !== "CLOSED") add(openCareCasesByUnit, item.organizationUnitId);
    if (item.status !== "CLOSED" && item.sensitivity === "HIGHLY_RESTRICTED") add(highRiskCasesByUnit, item.organizationUnitId);
  }
  for (const item of safeguardingCases) {
    if (item.status !== "CLOSED") add(openCareCasesByUnit, item.organizationUnitId);
    if (item.status !== "CLOSED" && ["HIGH", "CRITICAL"].includes(item.severity)) add(highRiskCasesByUnit, item.organizationUnitId);
  }
  for (const transfer of transfers) {
    if (transfer.status !== "PENDING") continue;
    add(pendingTransfersByUnit, transfer.fromUnitId);
    add(pendingTransfersByUnit, transfer.toUnitId);
  }
  for (const expiry of expiryItems) {
    const unitId = expiry.workspaceId ? workspaceUnitById.get(expiry.workspaceId) : null;
    const reviewRisk = expiry.reviewDueAt && expiry.reviewDueAt <= now;
    const expiryRisk = expiry.expiresAt && expiry.expiresAt <= now;
    if (unitId && ["ACTIVE", "REVIEW_DUE", "EXPIRED"].includes(expiry.status) && (reviewRisk || expiryRisk)) {
      add(renewalRisksByUnit, unitId);
    }
  }

  const scores = units.map((unit) => {
    const target = memberTarget(unit.type);
    const memberCount = membersByUnit.get(unit.id) ?? 0;
    const activeMembers = activeMembersByUnit.get(unit.id) ?? 0;
    const completeProfiles = completeProfilesByUnit.get(unit.id) ?? 0;
    const leaderCount = leadersByUnit.get(unit.id) ?? 0;
    const creatorCount = workspaceCreatorsByUnit.get(unit.id) ?? 0;
    const workspaceCount = workspacesByUnit.get(unit.id) ?? 0;
    const workspaceMemberCount = workspaceMembersByUnit.get(unit.id) ?? 0;
    const fileCount = filesByUnit.get(unit.id) ?? 0;
    const meetingCount = meetingsByUnit.get(unit.id) ?? 0;
    const projectCount = projectsByUnit.get(unit.id) ?? 0;
    const completedProjectCount = completedProjectsByUnit.get(unit.id) ?? 0;
    const overdueProjectCount = overdueProjectsByUnit.get(unit.id) ?? 0;
    const recentSessionCount = recentSessionsByUnit.get(unit.id) ?? 0;
    const recentAttendanceCount = recentAttendanceByUnit.get(unit.id) ?? 0;
    const openCareCases = openCareCasesByUnit.get(unit.id) ?? 0;
    const highRiskCases = highRiskCasesByUnit.get(unit.id) ?? 0;
    const pendingTransfers = pendingTransfersByUnit.get(unit.id) ?? 0;
    const renewalRisks = renewalRisksByUnit.get(unit.id) ?? 0;

    const membershipScore = clampScore((activeMembers / target) * 15 + (completeProfiles / Math.max(1, memberCount)) * 5, 20);
    const leadershipScore = clampScore((leaderCount ? 10 : 0) + (creatorCount ? 5 : 0), 15);
    const collaborationScore = clampScore(workspaceCount * 4 + Math.min(5, workspaceMemberCount / 8) + Math.min(4, fileCount / 12) + Math.min(2, meetingCount / 6), 15);
    const attendanceScore = clampScore(recentSessionCount * 4 + Math.min(7, recentAttendanceCount / 8), 15);
    const projectScore = clampScore((projectCount ? 7 : 4) + completedProjectCount * 3 + Math.max(0, projectCount - completedProjectCount) * 2 - overdueProjectCount * 4, 15);
    const careScore = clampScore(10 - highRiskCases * 3 - Math.max(0, openCareCases - 4), 10);
    const governanceScore = clampScore(10 - pendingTransfers * 2 - renewalRisks * 2, 10);
    const score =
      membershipScore +
      leadershipScore +
      collaborationScore +
      attendanceScore +
      projectScore +
      careScore +
      governanceScore;
    const recommendations: string[] = [];
    if (!leaderCount) recommendations.push("Assign at least one accountable leader.");
    if (!activeMembers) recommendations.push("Attach active member profiles to this unit.");
    if (!recentSessionCount) recommendations.push("Run QR attendance for a recent service, event, or meeting.");
    if (!workspaceCount) recommendations.push("Create a scoped workspace for files, chat, tasks, and meetings.");
    if (overdueProjectCount) recommendations.push("Review overdue projects and update due dates or status.");
    if (pendingTransfers) recommendations.push("Review pending branch transfer requests.");
    if (renewalRisks) recommendations.push("Renew expired or review-due documents.");
    if (highRiskCases) recommendations.push("Review high-risk care or safeguarding cases with approved leaders.");

    return {
      unit,
      parent: unit.parentId ? unitById.get(unit.parentId) ?? null : null,
      score,
      grade: grade(score),
      breakdown: {
        membershipScore,
        leadershipScore,
        collaborationScore,
        attendanceScore,
        projectScore,
        careScore,
        governanceScore
      },
      metrics: {
        members: memberCount,
        activeMembers,
        completeProfiles,
        leaders: leaderCount,
        workspaceCreators: creatorCount,
        workspaces: workspaceCount,
        workspaceMembers: workspaceMemberCount,
        files: fileCount,
        meetings: meetingCount,
        projects: projectCount,
        completedProjects: completedProjectCount,
        overdueProjects: overdueProjectCount,
        recentAttendanceSessions: recentSessionCount,
        recentAttendanceRecords: recentAttendanceCount,
        openCareCases,
        highRiskCases,
        pendingTransfers,
        renewalRisks
      },
      recommendations
    };
  });

  const averageScore = scores.length ? Math.round(scores.reduce((total, item) => total + item.score, 0) / scores.length) : 0;
  return {
    generatedAt: now,
    scores: scores.sort((a, b) => a.score - b.score || a.unit.name.localeCompare(b.unit.name)),
    overview: {
      averageScore,
      excellent: scores.filter((item) => item.score >= 85).length,
      healthy: scores.filter((item) => item.score >= 70 && item.score < 85).length,
      watch: scores.filter((item) => item.score >= 40 && item.score < 70).length,
      urgent: scores.filter((item) => item.score < 40).length
    }
  };
}
