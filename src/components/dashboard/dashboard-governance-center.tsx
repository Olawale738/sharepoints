import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock3, Link2, ShieldAlert, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";

type GovernanceSignal = {
  label: string;
  value: number | string;
  detail: string;
  tone: "ok" | "warn" | "danger";
};

type GovernanceTask = {
  id: string;
  title: string;
  status: string;
  dueDate?: string | null;
  workspace: {
    id: string;
    name: string;
  };
  assignedTo?: {
    name?: string | null;
    email?: string | null;
  } | null;
};

type GovernanceShareLink = {
  id: string;
  createdAt: string;
  expiresAt?: string | null;
  file: {
    id: string;
    fileName: string;
    workspace: {
      id: string;
      name: string;
    };
  };
  createdBy: {
    name?: string | null;
    email?: string | null;
  };
};

type GovernanceActivity = {
  id: string;
  action: string;
  createdAt: string;
  workspace?: {
    id: string;
    name: string;
  } | null;
  user?: {
    name?: string | null;
    email?: string | null;
  } | null;
};

type DormantWorkspace = {
  id: string;
  name: string;
  filesCount: number;
  membersCount: number;
};

type DashboardGovernanceCenterProps = {
  signals: GovernanceSignal[];
  priorityTasks: GovernanceTask[];
  activeShareLinks: GovernanceShareLink[];
  criticalActivities: GovernanceActivity[];
  dormantWorkspaces: DormantWorkspace[];
};

const signalStyles: Record<GovernanceSignal["tone"], string> = {
  ok: "bg-mint",
  warn: "bg-wheat",
  danger: "bg-clay/10 text-clay"
};

const taskStatusLabels: Record<string, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  DONE: "Done"
};

function actionLabel(action: string) {
  return action.replaceAll(".", " ").replaceAll("_", " ");
}

export function DashboardGovernanceCenter({
  signals,
  priorityTasks,
  activeShareLinks,
  criticalActivities,
  dormantWorkspaces
}: DashboardGovernanceCenterProps) {
  return (
    <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <ShieldAlert className="h-4 w-4 text-moss" />
            Governance center
          </p>
          <p className="mt-1 text-xs text-ink/55">
            Cross-workspace risk signals, priority work, member-only share links, and sensitive activity.
          </p>
        </div>
        <Badge className="bg-mint">Live oversight</Badge>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {signals.map((signal) => (
          <div key={signal.label} className="rounded-md border border-ink/10 bg-paper p-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-xs font-medium text-ink/55">{signal.label}</p>
              <Badge className={signalStyles[signal.tone]}>{signal.value}</Badge>
            </div>
            <p className="mt-2 text-xs text-ink/60">{signal.detail}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="rounded-md border border-ink/10 bg-paper p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <CheckCircle2 className="h-4 w-4 text-moss" />
              Priority tasks
            </p>
            <Badge>{priorityTasks.length}</Badge>
          </div>
          <div className="space-y-2">
            {priorityTasks.length === 0 ? <p className="text-sm text-ink/55">No priority tasks right now.</p> : null}
            {priorityTasks.map((task) => (
              <Link
                key={task.id}
                href={`/dashboard/workspaces/${task.workspace.id}`}
                className="block rounded-md border border-ink/10 bg-white px-3 py-2 transition hover:bg-mint/35"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium text-ink">{task.title}</p>
                  <Badge className={task.status === "BLOCKED" ? "bg-clay/10 text-clay" : "bg-wheat"}>
                    {taskStatusLabels[task.status] ?? task.status.toLowerCase()}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-ink/50">
                  {task.workspace.name} - {task.assignedTo?.name ?? task.assignedTo?.email ?? "Unassigned"}
                  {task.dueDate ? ` - due ${formatDate(task.dueDate)}` : ""}
                </p>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-ink/10 bg-paper p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Link2 className="h-4 w-4 text-moss" />
              Active member-only share links
            </p>
            <Badge>{activeShareLinks.length}</Badge>
          </div>
          <div className="space-y-2">
            {activeShareLinks.length === 0 ? <p className="text-sm text-ink/55">No active share links found.</p> : null}
            {activeShareLinks.map((shareLink) => (
              <Link
                key={shareLink.id}
                href={`/dashboard/workspaces/${shareLink.file.workspace.id}`}
                className="block rounded-md border border-ink/10 bg-white px-3 py-2 transition hover:bg-mint/35"
              >
                <p className="truncate text-sm font-medium text-ink">{shareLink.file.fileName}</p>
                <p className="mt-1 text-xs text-ink/50">
                  {shareLink.file.workspace.name} - created by {shareLink.createdBy.name ?? shareLink.createdBy.email}
                </p>
                <p className="mt-1 text-xs text-ink/45">
                  {shareLink.expiresAt ? `Expires ${formatDate(shareLink.expiresAt)}` : "No expiration set"}
                </p>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-ink/10 bg-paper p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <AlertTriangle className="h-4 w-4 text-clay" />
              Sensitive activity
            </p>
            <Badge>{criticalActivities.length}</Badge>
          </div>
          <div className="space-y-2">
            {criticalActivities.length === 0 ? <p className="text-sm text-ink/55">No sensitive events in the latest window.</p> : null}
            {criticalActivities.map((activity) => (
              <Link
                key={activity.id}
                href={activity.workspace?.id ? `/dashboard/workspaces/${activity.workspace.id}` : "/dashboard"}
                className="block rounded-md border border-ink/10 bg-white px-3 py-2 transition hover:bg-mint/35"
              >
                <p className="truncate text-sm font-medium text-ink">{actionLabel(activity.action)}</p>
                <p className="mt-1 text-xs text-ink/50">
                  {activity.user?.name ?? activity.user?.email ?? "System"} - {activity.workspace?.name ?? "Organization"} -{" "}
                  {formatDate(activity.createdAt)}
                </p>
              </Link>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-ink/10 bg-paper p-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <UsersRound className="h-4 w-4 text-moss" />
              Setup attention
            </p>
            <Badge>{dormantWorkspaces.length}</Badge>
          </div>
          <div className="space-y-2">
            {dormantWorkspaces.length === 0 ? <p className="text-sm text-ink/55">All visible workspaces have healthy setup signals.</p> : null}
            {dormantWorkspaces.map((workspace) => (
              <Link
                key={workspace.id}
                href={`/dashboard/workspaces/${workspace.id}`}
                className="block rounded-md border border-ink/10 bg-white px-3 py-2 transition hover:bg-mint/35"
              >
                <p className="truncate text-sm font-medium text-ink">{workspace.name}</p>
                <p className="mt-1 flex items-center gap-2 text-xs text-ink/50">
                  <Clock3 className="h-3.5 w-3.5" />
                  {workspace.filesCount} files - {workspace.membersCount} members
                </p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
