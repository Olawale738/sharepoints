import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { BarChart3, CalendarDays, ClipboardCheck, HeartHandshake, ShieldCheck, SlidersHorizontal, Sparkles, UserRound } from "lucide-react";

import { DashboardWorkspaceSwitcher } from "@/components/dashboard/dashboard-workspace-switcher";
import { GlobalSearch } from "@/components/dashboard/global-search";
import { LocaleSwitcher } from "@/components/dashboard/locale-switcher";
import { NotificationCenter } from "@/components/dashboard/notification-center";
import { PlatformClient } from "@/components/dashboard/platform-client";
import { PwaInstallButton } from "@/components/dashboard/pwa-install-button";
import { SignOutButton } from "@/components/dashboard/sign-out-button";
import { WorkspaceActions } from "@/components/dashboard/workspace-actions";
import { appMessages, normalizeLocale } from "@/lib/i18n";

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
  locale: string;
  children: ReactNode;
};

export function DashboardShell({ user, workspaces, canCreateWorkspace, locale, children }: DashboardShellProps) {
  const canOpenAdminCenter = workspaces.some((workspace) => workspace.role === "ADMIN");
  const normalizedLocale = normalizeLocale(locale);
  const messages = appMessages(normalizedLocale);

  return (
    <div className="min-h-screen bg-paper">
      <PlatformClient />
      <aside className="fixed inset-y-0 left-0 hidden w-72 overflow-y-auto border-r border-ink/10 bg-white px-4 py-5 lg:block">
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

        <div className="mt-6 rounded-lg border border-ink/10 bg-paper p-3">
          <WorkspaceActions canCreateWorkspace={canCreateWorkspace} />
        </div>

        <div className="mt-6">
          <DashboardWorkspaceSwitcher workspaces={workspaces} />
        </div>

        <div className="mt-6 rounded-lg border border-ink/10 bg-paper p-3 text-xs text-ink/55">
          <p className="font-medium text-ink">{messages.protectedAccess}</p>
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
            <div className="hidden min-w-0 flex-1 justify-center xl:flex">
              <GlobalSearch />
            </div>
            <div className="flex min-w-0 items-center gap-1">
              <Link
                aria-label="AI Assistant"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                href="/dashboard/assistant"
              >
                <Sparkles className="h-4 w-4" />
                <span className="hidden 2xl:inline">AI Assistant</span>
              </Link>
              <Link
                aria-label="Required forms"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                href="/dashboard/compliance"
              >
                <ClipboardCheck className="h-4 w-4" />
                <span className="hidden 2xl:inline">Required forms</span>
              </Link>
              <Link
                aria-label="Calendar"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                href="/dashboard/calendar"
              >
                <CalendarDays className="h-4 w-4" />
                <span className="hidden 2xl:inline">{messages.calendar}</span>
              </Link>
              <Link
                aria-label="Analytics"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                href="/dashboard/analytics"
              >
                <BarChart3 className="h-4 w-4" />
                <span className="hidden 2xl:inline">{messages.analytics}</span>
              </Link>
              <Link
                aria-label={messages.operations}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                href="/dashboard/operations"
              >
                <HeartHandshake className="h-4 w-4" />
                <span className="hidden 2xl:inline">{messages.operations}</span>
              </Link>
              <NotificationCenter />
              <PwaInstallButton />
              <LocaleSwitcher locale={normalizedLocale} />
              {canOpenAdminCenter ? (
                <Link
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                  href="/dashboard/admin"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  <span className="hidden xl:inline">{messages.admin}</span>
                </Link>
              ) : null}
              <Link
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                href="/dashboard/profile"
              >
                <UserRound className="h-4 w-4" />
                <span className="hidden xl:inline">{messages.profile}</span>
              </Link>
              <SignOutButton />
            </div>
          </div>
          <div className="mt-3 xl:hidden">
            <GlobalSearch />
          </div>
          <details className="mt-3 rounded-md border border-ink/10 bg-white p-3 lg:hidden">
            <summary className="cursor-pointer text-sm font-medium">{messages.workspaces}</summary>
            <div className="mt-4 space-y-4">
              <WorkspaceActions canCreateWorkspace={canCreateWorkspace} />
              <div className="rounded-lg border border-ink/10 bg-paper p-3">
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
