"use client";

import Link from "next/link";
import { ArrowRight, FileText, Search, Sparkles, UsersRound } from "lucide-react";
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

type DashboardCommandCenterProps = {
  workspaces: CommandWorkspace[];
  recentFiles: CommandFile[];
  canCreateWorkspace: boolean;
};

export function DashboardCommandCenter({ workspaces, recentFiles, canCreateWorkspace }: DashboardCommandCenterProps) {
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

  return (
    <section className="overflow-hidden rounded-lg border border-ink/10 bg-white shadow-panel">
      <div className="border-b border-ink/10 bg-navy px-5 py-5 text-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-medium text-gold">
              <Sparkles className="h-4 w-4" />
              LETW command center
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Find any workspace, file, or next action fast.</h2>
            <p className="mt-2 max-w-3xl text-sm text-white/70">
              A single control surface for collaboration, document access, team movement, and operational review.
            </p>
          </div>
          <div className="rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm text-white/80">
            {canCreateWorkspace ? "Admin and leader creation enabled" : "Workspace creation is restricted"}
          </div>
        </div>
        <div className="relative mt-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
          <Input
            className="h-11 border-white/20 bg-white pl-9 text-ink"
            placeholder="Search workspaces or recent files"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-0 lg:grid-cols-2">
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
        </div>

        <div className="p-4">
          <div className="mb-3 flex items-center justify-between">
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
      </div>
    </section>
  );
}
