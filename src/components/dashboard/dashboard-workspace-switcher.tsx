"use client";

import Link from "next/link";
import { Search, Files, UsersRound } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { roleLabel } from "@/lib/roles";

type WorkspaceNavItem = {
  id: string;
  name: string;
  role: string;
  filesCount: number;
  membersCount: number;
};

type DashboardWorkspaceSwitcherProps = {
  workspaces: WorkspaceNavItem[];
};

export function DashboardWorkspaceSwitcher({ workspaces }: DashboardWorkspaceSwitcherProps) {
  const [query, setQuery] = useState("");
  const filteredWorkspaces = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return workspaces;
    }

    return workspaces.filter((workspace) => {
      return [workspace.name, roleLabel(workspace.role), String(workspace.filesCount), String(workspace.membersCount)]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [query, workspaces]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
        <Input
          className="h-10 bg-white/95 pl-9"
          placeholder="Search workspaces"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <nav className="space-y-2">
        {filteredWorkspaces.length === 0 ? (
          <p className="rounded-md border border-white/20 bg-white/10 px-3 py-4 text-sm text-white/70">
            No workspace matches that search.
          </p>
        ) : null}
        {filteredWorkspaces.map((workspace) => (
          <Link
            key={workspace.id}
            href={`/dashboard/workspaces/${workspace.id}`}
            className="block rounded-md border border-transparent px-3 py-3 transition hover:border-white/20 hover:bg-white/10"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="line-clamp-2 text-sm font-medium text-white">{workspace.name}</span>
              <Badge className="bg-gold text-navy">{roleLabel(workspace.role)}</Badge>
            </div>
            <div className="mt-2 flex items-center gap-3 text-xs text-white/65">
              <span className="inline-flex items-center gap-1">
                <Files className="h-3.5 w-3.5" />
                {workspace.filesCount}
              </span>
              <span className="inline-flex items-center gap-1">
                <UsersRound className="h-3.5 w-3.5" />
                {workspace.membersCount}
              </span>
            </div>
          </Link>
        ))}
      </nav>
    </div>
  );
}
