"use client";

import Link from "next/link";
import { ArrowRight, Bell, CheckCircle2, Clock3, FileText, Search, Sparkles, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { roleLabel } from "@/lib/roles";
import { formatBytes, formatDate } from "@/lib/utils";

type CommandWorkspace = {
  id: string;
  name: string;
  role: string;
  description?: string | null;
  filesCount: number;
  membersCount: number;
};

type CommandFile = {
  id: string;
  fileName: string;
  size: number;
  createdAt: string;
  workspace: {
    id: string;
    name: string;
  };
};

type CommandTask = {
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

type CommandAnnouncement = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string;
  workspace: {
    id: string;
    name: string;
  };
};

type CommandMember = {
  id: string;
  role: string;
  workspace: {
    id: string;
    name: string;
  };
  user: {
    name?: string | null;
    email?: string | null;
  };
};

type CommandActivity = {
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

type DashboardCommandCenterProps = {
  workspaces: CommandWorkspace[];
  recentFiles: CommandFile[];
  tasks: CommandTask[];
  announcements: CommandAnnouncement[];
  members: CommandMember[];
  activities: CommandActivity[];
  canCreateWorkspace: boolean;
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

export function DashboardCommandCenter({
  workspaces,
  recentFiles,
  tasks,
  announcements,
  members,
  activities,
  canCreateWorkspace
}: DashboardCommandCenterProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const workspaceResults = useMemo(() => {
    if (!normalizedQuery) {
      return workspaces.slice(0, 4);
    }

    return workspaces
      .filter((workspace) =>
        [workspace.name, workspace.description ?? "", roleLabel(workspace.role)].join(" ").toLowerCase().includes(normalizedQuery)
      )
      .slice(0, 5);
  }, [normalizedQuery, workspaces]);
  const fileResults = useMemo(() => {
    if (!normalizedQuery) {
      return recentFiles.slice(0, 4);
    }

    return recentFiles
      .filter((file) => [file.fileName, file.workspace.name].join(" ").toLowerCase().includes(normalizedQuery))
      .slice(0, 5);
  }, [normalizedQuery, recentFiles]);
  const taskResults = useMemo(() => {
    if (!normalizedQuery) {
      return tasks.slice(0, 4);
    }

    return tasks
      .filter((task) =>
        [
          task.title,
          task.workspace.name,
          taskStatusLabels[task.status] ?? task.status,
          task.assignedTo?.name ?? "",
          task.assignedTo?.email ?? ""
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      )
      .slice(0, 5);
  }, [normalizedQuery, tasks]);
  const announcementResults = useMemo(() => {
    if (!normalizedQuery) {
      return announcements.slice(0, 4);
    }

    return announcements
      .filter((announcement) =>
        [announcement.title, announcement.body, announcement.workspace.name].join(" ").toLowerCase().includes(normalizedQuery)
      )
      .slice(0, 5);
  }, [announcements, normalizedQuery]);
  const memberResults = useMemo(() => {
    if (!normalizedQuery) {
      return members.slice(0, 4);
    }

    return members
      .filter((member) =>
        [member.user.name ?? "", member.user.email ?? "", roleLabel(member.role), member.workspace.name]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      )
      .slice(0, 5);
  }, [members, normalizedQuery]);
  const activityResults = useMemo(() => {
    if (!normalizedQuery) {
      return activities.slice(0, 4);
    }

    return activities
      .filter((activity) =>
        [
          actionLabel(activity.action),
          activity.workspace?.name ?? "",
          activity.user?.name ?? "",
          activity.user?.email ?? ""
        ]
          .join(" ")
          .toLowerCase()
          .includes(normalizedQuery)
      )
      .slice(0, 5);
  }, [activities, normalizedQuery]);

  return (
    <section className="overflow-hidden rounded-lg border border-ink/10 bg-white shadow-soft">
      <div className="border-b border-ink/10 bg-paper px-5 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-medium text-moss">
              <Sparkles className="h-4 w-4" />
              LETW command center
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">Find any workspace, file, or next action fast.</h2>
            <p className="mt-2 max-w-3xl text-sm text-ink/60">
              A single control surface for workspaces, documents, people, tasks, announcements, and audit activity.
            </p>
          </div>
          <div className="rounded-md border border-ink/10 bg-white px-3 py-2 text-sm text-ink/60">
            {canCreateWorkspace ? "Admin and leader creation enabled" : "Workspace creation is restricted"}
          </div>
        </div>
        <div className="relative mt-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
          <Input
            className="h-11 bg-white pl-9 text-ink"
            placeholder="Search workspaces, files, people, tasks, announcements, or activity"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-3">
        <div className="border-b border-ink/10 p-4 lg:border-b-0 lg:border-r">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Workspace results</h3>
            <Badge>{workspaceResults.length}</Badge>
          </div>
          <div className="space-y-2">
            {workspaceResults.length === 0 ? <p className="rounded-md bg-paper px-3 py-5 text-sm text-ink/55">No matching workspaces.</p> : null}
            {workspaceResults.map((workspace) => (
              <Link
                key={workspace.id}
                className="group flex items-center justify-between gap-3 rounded-md border border-ink/10 bg-paper px-3 py-3 transition hover:border-moss/25 hover:bg-mint/40"
                href={`/dashboard/workspaces/${workspace.id}`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-ink">{workspace.name}</p>
                    <Badge className={workspace.role === "ADMIN" ? "bg-wheat" : undefined}>{roleLabel(workspace.role)}</Badge>
                  </div>
                  <p className="mt-1 flex items-center gap-3 text-xs text-ink/55">
                    <span>{workspace.filesCount} files</span>
                    <span className="inline-flex items-center gap-1">
                      <UsersRound className="h-3.5 w-3.5" />
                      {workspace.membersCount}
                    </span>
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-ink/35 transition group-hover:translate-x-0.5 group-hover:text-moss" />
              </Link>
            ))}
          </div>

          <div className="mb-3 mt-5 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Recent file results</h3>
            <Badge>{fileResults.length}</Badge>
          </div>
          <div className="space-y-2">
            {fileResults.length === 0 ? <p className="rounded-md bg-paper px-3 py-5 text-sm text-ink/55">No matching files.</p> : null}
            {fileResults.map((file) => (
              <Link
                key={file.id}
                className="group flex items-center justify-between gap-3 rounded-md border border-ink/10 bg-paper px-3 py-3 transition hover:border-moss/25 hover:bg-mint/40"
                href={`/dashboard/workspaces/${file.workspace.id}`}
              >
                <div className="flex min-w-0 items-start gap-3">
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white text-moss">
                    <FileText className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{file.fileName}</p>
                    <p className="mt-1 text-xs text-ink/55">
                      {file.workspace.name} - {formatBytes(file.size)} - {formatDate(file.createdAt)}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-ink/35 transition group-hover:translate-x-0.5 group-hover:text-moss" />
              </Link>
            ))}
          </div>
        </div>

        <div className="border-b border-ink/10 p-4 lg:border-b-0 xl:border-r">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">People results</h3>
            <Badge>{memberResults.length}</Badge>
          </div>
          <div className="space-y-2">
            {memberResults.length === 0 ? <p className="rounded-md bg-paper px-3 py-5 text-sm text-ink/55">No matching people.</p> : null}
            {memberResults.map((member) => (
              <Link
                key={member.id}
                className="group flex items-center justify-between gap-3 rounded-md border border-ink/10 bg-paper px-3 py-3 transition hover:border-moss/25 hover:bg-mint/40"
                href={`/dashboard/workspaces/${member.workspace.id}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{member.user.name ?? member.user.email ?? "Member"}</p>
                  <p className="mt-1 truncate text-xs text-ink/55">
                    {member.workspace.name} - {roleLabel(member.role)}
                  </p>
                </div>
                <UsersRound className="h-4 w-4 shrink-0 text-ink/35 transition group-hover:text-moss" />
              </Link>
            ))}
          </div>

          <div className="mb-3 mt-5 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Task results</h3>
            <Badge>{taskResults.length}</Badge>
          </div>
          <div className="space-y-2">
            {taskResults.length === 0 ? <p className="rounded-md bg-paper px-3 py-5 text-sm text-ink/55">No matching tasks.</p> : null}
            {taskResults.map((task) => (
              <Link
                key={task.id}
                className="group flex items-center justify-between gap-3 rounded-md border border-ink/10 bg-paper px-3 py-3 transition hover:border-moss/25 hover:bg-mint/40"
                href={`/dashboard/workspaces/${task.workspace.id}`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-ink">{task.title}</p>
                    <Badge className={task.status === "BLOCKED" ? "bg-clay/10 text-clay" : "bg-wheat"}>
                      {taskStatusLabels[task.status] ?? task.status.toLowerCase()}
                    </Badge>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink/55">
                    <span>{task.workspace.name}</span>
                    {task.dueDate ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock3 className="h-3.5 w-3.5" />
                        {formatDate(task.dueDate)}
                      </span>
                    ) : null}
                  </p>
                </div>
                <CheckCircle2 className="h-4 w-4 shrink-0 text-ink/35 transition group-hover:text-moss" />
              </Link>
            ))}
          </div>
        </div>

        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Announcement results</h3>
            <Badge>{announcementResults.length}</Badge>
          </div>
          <div className="space-y-2">
            {announcementResults.length === 0 ? (
              <p className="rounded-md bg-paper px-3 py-5 text-sm text-ink/55">No matching announcements.</p>
            ) : null}
            {announcementResults.map((announcement) => (
              <Link
                key={announcement.id}
                className="group flex items-center justify-between gap-3 rounded-md border border-ink/10 bg-paper px-3 py-3 transition hover:border-moss/25 hover:bg-mint/40"
                href={`/dashboard/workspaces/${announcement.workspace.id}`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-ink">{announcement.title}</p>
                    {announcement.pinned ? <Badge className="bg-wheat">Pinned</Badge> : null}
                  </div>
                  <p className="mt-1 truncate text-xs text-ink/55">
                    {announcement.workspace.name} - {formatDate(announcement.createdAt)}
                  </p>
                </div>
                <Bell className="h-4 w-4 shrink-0 text-ink/35 transition group-hover:text-moss" />
              </Link>
            ))}
          </div>

          <div className="mb-3 mt-5 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Activity results</h3>
            <Badge>{activityResults.length}</Badge>
          </div>
          <div className="space-y-2">
            {activityResults.length === 0 ? <p className="rounded-md bg-paper px-3 py-5 text-sm text-ink/55">No matching activity.</p> : null}
            {activityResults.map((activity) => (
              <Link
                key={activity.id}
                className="group block rounded-md border border-ink/10 bg-paper px-3 py-3 transition hover:border-moss/25 hover:bg-mint/40"
                href={activity.workspace?.id ? `/dashboard/workspaces/${activity.workspace.id}` : "/dashboard"}
              >
                <p className="truncate text-sm font-semibold text-ink">{actionLabel(activity.action)}</p>
                <p className="mt-1 truncate text-xs text-ink/55">
                  {activity.user?.name ?? activity.user?.email ?? "System"} - {activity.workspace?.name ?? "Organization"} -{" "}
                  {formatDate(activity.createdAt)}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
