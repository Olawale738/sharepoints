import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { ShieldCheck, UserRound } from "lucide-react";

import { DashboardWorkspaceSwitcher } from "@/components/dashboard/dashboard-workspace-switcher";
import { SignOutButton } from "@/components/dashboard/sign-out-button";
import { WorkspaceActions } from "@/components/dashboard/workspace-actions";

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
      <aside className="fixed inset-y-0 left-0 hidden w-72 overflow-y-auto border-r border-white/10 bg-navy px-4 py-5 text-white lg:block">
        <Link href="/dashboard" className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-md border border-white/15 bg-white">
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
            <p className="font-semibold text-white">LETW</p>
            <p className="text-xs text-white/60">Collaboration</p>
          </div>
        </Link>

        <div className="mt-6 rounded-lg border border-white/10 bg-white/10 p-3">
          <WorkspaceActions canCreateWorkspace={canCreateWorkspace} />
        </div>

        <div className="mt-6">
          <DashboardWorkspaceSwitcher workspaces={workspaces} />
        </div>

        <div className="mt-6 rounded-lg border border-white/10 bg-white/10 p-3 text-xs text-white/65">
          <p className="font-medium text-white">Protected LETW access</p>
          <p className="mt-1">@letw.org accounts must be invited before they can use the service.</p>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-ink/10 bg-paper/90 px-4 py-3 backdrop-blur lg:px-8">
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
              <div className="rounded-lg bg-navy p-3">
                <DashboardWorkspaceSwitcher workspaces={workspaces} />
              </div>
            </div>
          </details>
        </header>

        <main className="px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
