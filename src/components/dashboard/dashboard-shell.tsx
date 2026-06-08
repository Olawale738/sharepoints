import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { Files, ShieldCheck, UserRound, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SignOutButton } from "@/components/dashboard/sign-out-button";
import { WorkspaceActions } from "@/components/dashboard/workspace-actions";
import { roleLabel } from "@/lib/roles";

type WorkspaceNavItem = {
  id: string;
  name: string;
  role: string;
  filesCount: number;
  membersCount: number;
};

type DashboardShellProps = {
  user: {
    name?: string | null;
    email?: string | null;
  };
  workspaces: WorkspaceNavItem[];
  canCreateWorkspace: boolean;
  children: ReactNode;
};

export function DashboardShell({ user, workspaces, canCreateWorkspace, children }: DashboardShellProps) {
  return (
    <div className="min-h-screen bg-paper">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-ink/10 bg-white px-4 py-5 lg:block">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-md border border-ink/10 bg-white">
            <Image
              src="/letw-logo.png"
              alt="LETW logo"
              width={96}
              height={96}
              className="h-full w-full object-contain"
              priority
            />
          </div>
          <div>
            <p className="font-semibold text-ink">LETW</p>
            <p className="text-xs text-ink/55">Collaboration</p>
          </div>
        </Link>

        <div className="mt-6">
          <WorkspaceActions canCreateWorkspace={canCreateWorkspace} />
        </div>

        <nav className="mt-6 space-y-2">
          {workspaces.map((workspace) => (
            <Link
              key={workspace.id}
              href={`/dashboard/workspaces/${workspace.id}`}
              className="block rounded-md border border-transparent px-3 py-3 transition hover:border-ink/10 hover:bg-mint/50"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="line-clamp-2 text-sm font-medium text-ink">{workspace.name}</span>
                <Badge className="bg-wheat">{roleLabel(workspace.role)}</Badge>
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs text-ink/55">
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
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-ink/10 bg-paper/95 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium text-moss">
                <ShieldCheck className="h-4 w-4" />
                letw.org
              </p>
              <p className="truncate text-sm text-ink/60">{user.name ?? user.email}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                href="/dashboard/profile"
              >
                <UserRound className="h-4 w-4" />
                Profile
              </Link>
              <SignOutButton />
            </div>
          </div>
          <details className="mt-3 rounded-md border border-ink/10 bg-white p-3 lg:hidden">
            <summary className="cursor-pointer text-sm font-medium">Workspaces</summary>
            <div className="mt-4 space-y-4">
              <WorkspaceActions canCreateWorkspace={canCreateWorkspace} />
              <nav className="space-y-2">
                {workspaces.map((workspace) => (
                  <Link
                    key={workspace.id}
                    href={`/dashboard/workspaces/${workspace.id}`}
                    className="block rounded-md border border-ink/10 px-3 py-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 text-sm font-medium text-ink">{workspace.name}</span>
                      <Badge className="bg-wheat">{roleLabel(workspace.role)}</Badge>
                    </div>
                  </Link>
                ))}
              </nav>
            </div>
          </details>
        </header>

        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
