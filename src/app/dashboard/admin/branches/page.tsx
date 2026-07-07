import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, MapPinned, ShieldCheck, UsersRound } from "lucide-react";

import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";
import { formatDate } from "@/lib/utils";

function increment(map: Map<string, number>, key?: string | null, amount = 1) {
  if (!key) return;
  map.set(key, (map.get(key) ?? 0) + amount);
}

export default async function BranchDashboardsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await hasAnyWorkspaceAdminRole(session.user.id))) redirect("/dashboard");

  const [units, leaders, profiles, workspaces, projects, attendanceSessions, counsellingCases, transfers] = await Promise.all([
    prisma.organizationUnit.findMany({
      where: { active: true },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      take: 1000
    }),
    prisma.organizationUnitLeader.findMany({
      orderBy: { createdAt: "desc" },
      take: 1000
    }),
    prisma.memberProfile.findMany({
      select: { userId: true, currentOrganizationUnitId: true, membershipStatus: true, organizationPosition: true },
      take: 10000
    }),
    prisma.workspace.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, organizationUnitId: true, scopeType: true, _count: { select: { members: true, files: true, meetings: true } } },
      take: 2000
    }),
    prisma.churchProject.findMany({
      select: { id: true, name: true, status: true, organizationUnitId: true, budgetAmount: true, dueAt: true },
      take: 2000
    }),
    prisma.smartAttendanceSession.findMany({
      select: { id: true, title: true, active: true, organizationUnitId: true, startsAt: true },
      take: 1000
    }),
    prisma.counsellingCase.findMany({
      select: { id: true, organizationUnitId: true, status: true, sensitivity: true },
      take: 1000
    }),
    prisma.branchTransferRequest.findMany({
      select: { id: true, fromUnitId: true, toUnitId: true, status: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 1000
    })
  ]);
  const leaderUserIds = Array.from(new Set(leaders.map((leader) => leader.userId)));
  const leaderUsers = leaderUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: leaderUserIds } },
        select: { id: true, name: true, email: true }
      })
    : [];

  const unitById = new Map(units.map((unit) => [unit.id, unit]));
  const userById = new Map(leaderUsers.map((user) => [user.id, user]));
  const childrenByParent = new Map<string, number>();
  const membersByUnit = new Map<string, number>();
  const activeMembersByUnit = new Map<string, number>();
  const workspacesByUnit = new Map<string, number>();
  const filesByUnit = new Map<string, number>();
  const meetingsByUnit = new Map<string, number>();
  const projectsByUnit = new Map<string, number>();
  const projectBudgetByUnit = new Map<string, number>();
  const attendanceByUnit = new Map<string, number>();
  const counsellingByUnit = new Map<string, number>();
  const transferByUnit = new Map<string, number>();
  const leadersByUnit = new Map<string, typeof leaders>();

  for (const unit of units) increment(childrenByParent, unit.parentId);
  for (const profile of profiles) {
    increment(membersByUnit, profile.currentOrganizationUnitId);
    if (profile.membershipStatus === "ACTIVE") increment(activeMembersByUnit, profile.currentOrganizationUnitId);
  }
  for (const workspace of workspaces) {
    increment(workspacesByUnit, workspace.organizationUnitId);
    increment(filesByUnit, workspace.organizationUnitId, workspace._count.files);
    increment(meetingsByUnit, workspace.organizationUnitId, workspace._count.meetings);
  }
  for (const project of projects) {
    increment(projectsByUnit, project.organizationUnitId);
    increment(projectBudgetByUnit, project.organizationUnitId, project.budgetAmount ?? 0);
  }
  for (const sessionRecord of attendanceSessions) increment(attendanceByUnit, sessionRecord.organizationUnitId);
  for (const counsellingCase of counsellingCases) increment(counsellingByUnit, counsellingCase.organizationUnitId);
  for (const transfer of transfers) {
    increment(transferByUnit, transfer.fromUnitId);
    increment(transferByUnit, transfer.toUnitId);
  }
  for (const leader of leaders) {
    leadersByUnit.set(leader.unitId, [...(leadersByUnit.get(leader.unitId) ?? []), leader]);
  }

  const metrics = [
    { label: "Active units", value: units.length, detail: `${units.filter((unit) => unit.type === "COUNTRY").length} countries`, icon: MapPinned },
    { label: "Assigned members", value: profiles.filter((profile) => profile.currentOrganizationUnitId).length, detail: "Profiles tied to branches or units", icon: UsersRound },
    { label: "Scoped workspaces", value: workspaces.filter((workspace) => workspace.organizationUnitId).length, detail: "Country, region, branch, church, or ministry spaces", icon: Building2 },
    { label: "Leaders assigned", value: leaders.length, detail: "Global, regional, branch, and ministry leaders", icon: ShieldCheck }
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <Building2 className="h-4 w-4" />
              Branch dashboards
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Global LETW network intelligence</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
              See countries, regions, branches, churches, ministries, leaders, members, scoped workspaces, projects, attendance sessions,
              counselling cases, and transfers from one command page.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="inline-flex h-10 items-center rounded-md border border-ink/10 bg-paper px-4 text-sm font-medium hover:bg-mint/40" href="/dashboard/admin/global">
              Manage network
            </Link>
            <Link className="inline-flex h-10 items-center rounded-md border border-ink/10 bg-paper px-4 text-sm font-medium hover:bg-mint/40" href="/dashboard/admin">
              Back to admin
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;

          return (
            <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft" key={metric.label}>
              <Icon className="h-5 w-5 text-moss" />
              <p className="mt-3 text-2xl font-semibold text-ink">{metric.value}</p>
              <p className="text-sm text-ink/55">{metric.label}</p>
              <p className="mt-1 text-xs text-ink/45">{metric.detail}</p>
            </div>
          );
        })}
      </section>

      <section className="rounded-lg border border-ink/10 bg-white shadow-soft">
        <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Network performance by unit</h2>
          <Badge>{units.length} units</Badge>
        </div>
        <div className="grid gap-3 p-4 lg:grid-cols-2">
          {units.map((unit) => {
            const parent = unit.parentId ? unitById.get(unit.parentId) : null;
            const unitLeaders = leadersByUnit.get(unit.id) ?? [];

            return (
              <article className="rounded-lg border border-ink/10 bg-paper p-4" key={unit.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink">{unit.name}</p>
                    <p className="mt-1 text-xs text-ink/55">
                      {unit.type.toLowerCase()} {unit.code ? `- ${unit.code}` : ""} {parent ? `- under ${parent.name}` : "- top level"}
                    </p>
                  </div>
                  <Badge className={unit.type === "GLOBAL" ? "bg-wheat" : "bg-mint"}>{unit.type.toLowerCase()}</Badge>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                  <div className="rounded-md bg-white p-2">
                    <p className="font-semibold text-ink">{membersByUnit.get(unit.id) ?? 0}</p>
                    <p className="text-xs text-ink/50">members</p>
                  </div>
                  <div className="rounded-md bg-white p-2">
                    <p className="font-semibold text-ink">{workspacesByUnit.get(unit.id) ?? 0}</p>
                    <p className="text-xs text-ink/50">workspaces</p>
                  </div>
                  <div className="rounded-md bg-white p-2">
                    <p className="font-semibold text-ink">{projectsByUnit.get(unit.id) ?? 0}</p>
                    <p className="text-xs text-ink/50">projects</p>
                  </div>
                  <div className="rounded-md bg-white p-2">
                    <p className="font-semibold text-ink">{childrenByParent.get(unit.id) ?? 0}</p>
                    <p className="text-xs text-ink/50">children</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-ink/55 md:grid-cols-2">
                  <p>Active members: {activeMembersByUnit.get(unit.id) ?? 0}</p>
                  <p>Files in scoped workspaces: {filesByUnit.get(unit.id) ?? 0}</p>
                  <p>Meetings: {meetingsByUnit.get(unit.id) ?? 0}</p>
                  <p>Attendance sessions: {attendanceByUnit.get(unit.id) ?? 0}</p>
                  <p>Counselling cases: {counsellingByUnit.get(unit.id) ?? 0}</p>
                  <p>Transfers: {transferByUnit.get(unit.id) ?? 0}</p>
                  <p>Budget tracked: {projectBudgetByUnit.get(unit.id) ?? 0}</p>
                  <p>Country code: {unit.countryCode ?? "Not set"}</p>
                </div>
                <div className="mt-3 rounded-md bg-white p-3">
                  <p className="text-xs font-semibold uppercase text-ink/45">Assigned leaders</p>
                  <div className="mt-2 space-y-1">
                    {unitLeaders.length === 0 ? <p className="text-xs text-ink/50">No leader assigned.</p> : null}
                    {unitLeaders.map((leader) => {
                      const leaderUser = userById.get(leader.userId);
                      return (
                        <p className="text-sm text-ink" key={leader.id}>
                          {leaderUser?.name ?? leaderUser?.email ?? "Unknown leader"} - {leader.title}
                          {leader.canCreateWorkspaces ? " - workspace creator" : ""}
                        </p>
                      );
                    })}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-lg border border-ink/10 bg-white shadow-soft">
          <div className="border-b border-ink/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Scoped projects</h2>
          </div>
          <div className="divide-y divide-ink/10">
            {projects.slice(0, 12).map((project) => (
              <div className="px-4 py-3" key={project.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-ink">{project.name}</p>
                    <p className="mt-1 text-xs text-ink/50">
                      {project.organizationUnitId ? unitById.get(project.organizationUnitId)?.name ?? "Unknown unit" : "No unit"} -{" "}
                      {project.dueAt ? `due ${formatDate(project.dueAt)}` : "no due date"}
                    </p>
                  </div>
                  <Badge>{project.status.toLowerCase()}</Badge>
                </div>
              </div>
            ))}
            {projects.length === 0 ? <p className="px-4 py-8 text-sm text-ink/55">No scoped projects yet.</p> : null}
          </div>
        </div>

        <div className="rounded-lg border border-ink/10 bg-white shadow-soft">
          <div className="border-b border-ink/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Recent branch transfers</h2>
          </div>
          <div className="divide-y divide-ink/10">
            {transfers.slice(0, 12).map((transfer) => (
              <div className="px-4 py-3" key={transfer.id}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-ink">
                    {transfer.fromUnitId ? unitById.get(transfer.fromUnitId)?.name ?? "Unknown unit" : "No current unit"} to{" "}
                    {unitById.get(transfer.toUnitId)?.name ?? "Unknown unit"}
                  </p>
                  <Badge className={transfer.status === "PENDING" ? "bg-wheat" : "bg-paper"}>{transfer.status.toLowerCase()}</Badge>
                </div>
                <p className="mt-1 text-xs text-ink/50">{formatDate(transfer.createdAt)}</p>
              </div>
            ))}
            {transfers.length === 0 ? <p className="px-4 py-8 text-sm text-ink/55">No branch transfers yet.</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
