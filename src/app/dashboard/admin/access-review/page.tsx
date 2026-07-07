import Link from "next/link";
import { redirect } from "next/navigation";
import { Bot, CalendarClock, FileKey2, MonitorSmartphone, ShieldAlert, UserRoundCheck, UsersRound } from "lucide-react";
import { WorkspaceRole } from "@prisma/client";

import { auth } from "@/auth";
import { AccessReviewActionButton } from "@/components/dashboard/access-review-actions";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";
import { formatDate } from "@/lib/utils";

function nameOf(user?: { name?: string | null; email?: string | null } | null) {
  return user?.name ?? user?.email ?? "LETW member";
}

const privilegedWorkspaceRoles: WorkspaceRole[] = [WorkspaceRole.ADMIN, WorkspaceRole.LEADER, WorkspaceRole.MODERATOR];

export default async function AdvancedAccessReviewPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (!(await hasAnyWorkspaceAdminRole(session.user.id))) {
    redirect("/dashboard");
  }

  const now = new Date();
  const oldAccessDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const oldDeviceDate = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
  const [
    reviewMemberships,
    shareLinks,
    aiAgents,
    oldDevices,
    safeguardingCount,
    counsellingCount,
    accessReviewLogs,
    recentAccessConfirmations,
    workspaceMapRows
  ] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: {
        workspace: { deletedAt: null },
        OR: [
          { joinedAt: { lt: oldAccessDate } },
          { role: { in: privilegedWorkspaceRoles } },
          { user: { OR: [{ suspendedAt: { not: null } }, { accessRevokedAt: { not: null } }, { deletedAt: { not: null } }] } }
        ]
      },
      include: {
        workspace: { select: { id: true, name: true } },
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            suspendedAt: true,
            accessRevokedAt: true,
            deletedAt: true
          }
        }
      },
      orderBy: { joinedAt: "asc" },
      take: 200
    }),
    prisma.fileShareLink.findMany({
      where: {
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
        file: { deletedAt: null, workspace: { deletedAt: null } }
      },
      include: {
        file: {
          select: {
            id: true,
            fileName: true,
            workspace: { select: { id: true, name: true } }
          }
        },
        createdBy: { select: { name: true, email: true } }
      },
      orderBy: { createdAt: "asc" },
      take: 120
    }),
    prisma.workspaceAiAgent.findMany({
      where: { enabled: true },
      orderBy: { createdAt: "asc" },
      take: 80
    }),
    prisma.userDevice.findMany({
      where: {
        revokedAt: null,
        lastSeenAt: { lt: oldDeviceDate }
      },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { lastSeenAt: "asc" },
      take: 120
    }),
    prisma.safeguardingCase.count({ where: { status: { not: "CLOSED" } } }),
    prisma.counsellingCase.count({ where: { status: { not: "CLOSED" } } }),
    prisma.activityLog.findMany({
      where: {
        action: { startsWith: "access_review." }
      },
      include: {
        user: { select: { name: true, email: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 25
    }),
    prisma.activityLog.findMany({
      where: {
        action: "access_review.workspace_access_confirmed",
        createdAt: { gte: oldAccessDate }
      },
      select: { targetId: true }
    }),
    prisma.workspace.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true }
    })
  ]);

  const workspaceNames = new Map(workspaceMapRows.map((workspace) => [workspace.id, workspace.name]));
  const confirmedMemberIds = new Set(
    recentAccessConfirmations.map((log) => log.targetId).filter((targetId): targetId is string => Boolean(targetId))
  );
  const memberships = reviewMemberships.filter((membership) => !confirmedMemberIds.has(membership.id));
  const riskyMemberships = memberships.filter((membership) => {
    return (
      membership.user.suspendedAt ||
      membership.user.accessRevokedAt ||
      membership.user.deletedAt ||
      privilegedWorkspaceRoles.includes(membership.role)
    );
  });
  const metrics = [
    ["Review candidates", memberships.length, UsersRound, "Old, privileged, or restricted memberships"],
    ["Privileged/risky", riskyMemberships.length, ShieldAlert, "Leaders, moderators, admins, or restricted users"],
    ["Live share links", shareLinks.length, FileKey2, "Active download links requiring review"],
    ["AI agents", aiAgents.length, Bot, "Enabled custom AI agents"],
    ["Old devices", oldDevices.length, MonitorSmartphone, "Devices inactive for 60+ days"],
    ["Sensitive cases", safeguardingCount + counsellingCount, UserRoundCheck, "Open pastoral/safeguarding records"]
  ] as const;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <ShieldAlert className="h-4 w-4" />
              Advanced Access Review
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Quarterly access, file, AI, device, and sensitive-data review</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
              Review who can enter workspaces, which links are still live, which AI agents can search content, and which devices or
              sensitive records need attention.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="inline-flex h-10 items-center gap-2 rounded-md border border-ink/10 px-4 text-sm font-medium hover:bg-mint/40" href="/dashboard/admin">
              Admin center
            </Link>
            <AccessReviewActionButton
              label="Clear review logs"
              payload={{ action: "CLEAR_ACCESS_REVIEW_LOGS" }}
              confirmText="Clear access-review action logs?"
            />
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {metrics.map(([label, value, Icon, detail]) => (
          <div className="rounded-lg border border-ink/10 bg-white p-4" key={label}>
            <Icon className="h-5 w-5 text-moss" />
            <p className="mt-3 text-2xl font-semibold text-ink">{value}</p>
            <p className="text-sm text-ink/55">{label}</p>
            <p className="mt-1 text-xs text-ink/40">{detail}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-lg border border-ink/10 bg-white">
          <div className="border-b border-ink/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Workspace access to review</h2>
            <p className="mt-1 text-xs text-ink/55">Older memberships, leaders, moderators, admins, and restricted users should be confirmed monthly or quarterly.</p>
          </div>
          <div className="divide-y divide-ink/10">
            {memberships.length === 0 ? <p className="px-4 py-8 text-sm text-ink/55">No workspace access currently needs review.</p> : null}
            {memberships.map((membership) => (
              <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between" key={membership.id}>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-ink">{nameOf(membership.user)}</p>
                    <Badge className={membership.role === "ADMIN" ? "bg-wheat" : "bg-paper"}>{membership.role.toLowerCase()}</Badge>
                    {membership.user.accessRevokedAt || membership.user.suspendedAt || membership.user.deletedAt ? (
                      <Badge className="bg-clay/10 text-clay">restricted</Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-ink/50">
                    {membership.workspace.name} - joined {formatDate(membership.joinedAt)}
                  </p>
                </div>
                <AccessReviewActionButton
                  label="Confirm access"
                  payload={{ action: "CONFIRM_WORKSPACE_MEMBER", memberId: membership.id }}
                  confirmText={`Confirm ${nameOf(membership.user)} should keep access to ${membership.workspace.name}?`}
                />
                <AccessReviewActionButton
                  label="Remove"
                  payload={{ action: "REMOVE_WORKSPACE_MEMBER", memberId: membership.id }}
                  confirmText={`Remove ${nameOf(membership.user)} from ${membership.workspace.name}?`}
                  variant="danger"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-ink/10 bg-white">
          <div className="border-b border-ink/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Live share links</h2>
            <p className="mt-1 text-xs text-ink/55">Delete outdated public-style links. Download still requires membership login.</p>
          </div>
          <div className="divide-y divide-ink/10">
            {shareLinks.length === 0 ? <p className="px-4 py-8 text-sm text-ink/55">No active share links.</p> : null}
            {shareLinks.map((link) => (
              <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between" key={link.id}>
                <div className="min-w-0">
                  <p className="truncate font-medium text-ink">{link.file.fileName}</p>
                  <p className="mt-1 text-xs text-ink/50">
                    {link.file.workspace.name} - by {nameOf(link.createdBy)} -{" "}
                    {link.expiresAt ? `expires ${formatDate(link.expiresAt)}` : "no expiry"}
                  </p>
                </div>
                <AccessReviewActionButton
                  label="Delete link"
                  payload={{ action: "DELETE_SHARE_LINK", shareLinkId: link.id }}
                  confirmText={`Delete share link for ${link.file.fileName}?`}
                  variant="danger"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-lg border border-ink/10 bg-white">
          <div className="border-b border-ink/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">AI agents and source scopes</h2>
            <p className="mt-1 text-xs text-ink/55">Disable agents that should no longer search workspace or department content.</p>
          </div>
          <div className="divide-y divide-ink/10">
            {aiAgents.length === 0 ? <p className="px-4 py-8 text-sm text-ink/55">No enabled AI agents.</p> : null}
            {aiAgents.map((agent) => (
              <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between" key={agent.id}>
                <div className="min-w-0">
                  <p className="font-medium text-ink">{agent.name}</p>
                  <p className="mt-1 text-xs text-ink/50">
                    {agent.workspaceId ? workspaceNames.get(agent.workspaceId) ?? "Workspace scoped" : "Organization scoped"} - created{" "}
                    {formatDate(agent.createdAt)}
                  </p>
                </div>
                <AccessReviewActionButton
                  label="Disable"
                  payload={{ action: "DISABLE_AI_AGENT", agentId: agent.id }}
                  confirmText={`Disable ${agent.name}?`}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-ink/10 bg-white">
          <div className="border-b border-ink/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Old devices and sessions</h2>
            <p className="mt-1 text-xs text-ink/55">Revoke devices that have not checked in for 60 days.</p>
          </div>
          <div className="divide-y divide-ink/10">
            {oldDevices.length === 0 ? <p className="px-4 py-8 text-sm text-ink/55">No old devices found.</p> : null}
            {oldDevices.map((device) => (
              <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between" key={device.id}>
                <div className="min-w-0">
                  <p className="font-medium text-ink">{device.name ?? "Browser device"}</p>
                  <p className="mt-1 text-xs text-ink/50">
                    {nameOf(device.user)} - last seen {formatDate(device.lastSeenAt)}
                  </p>
                </div>
                <AccessReviewActionButton
                  label="Revoke device"
                  payload={{ action: "REVOKE_DEVICE", deviceId: device.id }}
                  confirmText={`Revoke ${device.name ?? "this device"}?`}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <div className="rounded-lg border border-ink/10 bg-white p-4">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-moss" />
            <h2 className="text-sm font-semibold text-ink">Recommended review rhythm</h2>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            {[
              "Monthly: remove expired share links and old devices.",
              "Quarterly: confirm leaders, moderators, AI agents, and workspace admins.",
              "Before conferences: review access points, QR identities, and temporary passes.",
              "After branch changes: review units, departments, ministry roles, and forms."
            ].map((item) => (
              <div className="rounded-md bg-paper p-3 text-sm leading-6 text-ink/65" key={item}>{item}</div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-ink/10 bg-white">
          <div className="border-b border-ink/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Access-review logs</h2>
          </div>
          <div className="divide-y divide-ink/10">
            {accessReviewLogs.length === 0 ? <p className="px-4 py-8 text-sm text-ink/55">No access-review logs yet.</p> : null}
            {accessReviewLogs.map((log) => (
              <div className="px-4 py-3 text-sm" key={log.id}>
                <p className="font-medium text-ink">{log.action.replaceAll("_", " ")}</p>
                <p className="mt-1 text-xs text-ink/50">
                  {nameOf(log.user)} - {formatDate(log.createdAt)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
