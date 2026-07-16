import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import {
  Award,
  BadgeCheck,
  BarChart3,
  BookOpen,
  CalendarDays,
  ClipboardCheck,
  Crown,
  DoorOpen,
  FileLock2,
  GraduationCap,
  HeartHandshake,
  KeyRound,
  Newspaper,
  RadioTower,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  Sprout,
  UserRound
} from "lucide-react";

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
  const canOpenLeadershipGovernance = workspaces.some((workspace) => ["ADMIN", "LEADER", "MODERATOR"].includes(workspace.role));
  const normalizedLocale = normalizeLocale(locale);
  const messages = appMessages(normalizedLocale);

  return (
    <div className="min-h-screen bg-paper" lang={normalizedLocale}>
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
          <p className="mt-1">{messages.protectedAccessDescription}</p>
        </div>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-20 border-b border-ink/10 bg-paper/90 px-4 py-3 backdrop-blur lg:px-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
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
            <div className="flex min-w-0 flex-wrap items-center gap-1 sm:justify-end">
              <Link
                aria-label="Leadership suite"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                href="/dashboard/leadership"
              >
                <Crown className="h-4 w-4" />
                <span className="hidden 2xl:inline">Leadership</span>
              </Link>
              {canOpenLeadershipGovernance ? (
                <Link
                  aria-label="Leadership governance"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                  href="/dashboard/leadership-governance"
                >
                  <FileLock2 className="h-4 w-4" />
                  <span className="hidden 2xl:inline">Governance</span>
                </Link>
              ) : null}
              {canOpenLeadershipGovernance ? (
                <Link
                  aria-label="Executive briefing room"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                  href="/dashboard/executive-briefing"
                >
                  <RadioTower className="h-4 w-4" />
                  <span className="hidden 2xl:inline">Executive</span>
                </Link>
              ) : null}
              {canOpenLeadershipGovernance ? (
                <Link
                  aria-label="Leadership document room"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                  href="/dashboard/leadership-documents"
                >
                  <FileLock2 className="h-4 w-4" />
                  <span className="hidden 2xl:inline">Private files</span>
                </Link>
              ) : null}
              <Link
                aria-label="Member portal"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                href="/dashboard/member-portal"
              >
                <UserRound className="h-4 w-4" />
                <span className="hidden 2xl:inline">Portal</span>
              </Link>
              <Link
                aria-label="Student portal"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                href="/dashboard/student"
              >
                <GraduationCap className="h-4 w-4" />
                <span className="hidden 2xl:inline">Student</span>
              </Link>
              <Link
                aria-label="Knowledge base"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                href="/dashboard/knowledge"
              >
                <BookOpen className="h-4 w-4" />
                <span className="hidden 2xl:inline">Knowledge</span>
              </Link>
              <Link
                aria-label="Certificate generator"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                href="/dashboard/certificates"
              >
                <Award className="h-4 w-4" />
                <span className="hidden 2xl:inline">Certificates</span>
              </Link>
              <Link
                aria-label="Rector academic certificates"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                href="/dashboard/rector"
              >
                <GraduationCap className="h-4 w-4" />
                <span className="hidden 2xl:inline">Rector</span>
              </Link>
              <Link
                aria-label="Mobile app"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                href="/dashboard/mobile-app"
              >
                <Smartphone className="h-4 w-4" />
                <span className="hidden 2xl:inline">Mobile</span>
              </Link>
              <Link
                aria-label="Emergency command center"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                href="/dashboard/emergency"
              >
                <RadioTower className="h-4 w-4" />
                <span className="hidden 2xl:inline">Emergency</span>
              </Link>
              <Link
                aria-label="Document authenticity scanner"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                href="/verify"
              >
                <ShieldCheck className="h-4 w-4" />
                <span className="hidden 2xl:inline">Verify</span>
              </Link>
              <Link
                aria-label="Digital membership card"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                href="/dashboard/membership-card"
              >
                <BadgeCheck className="h-4 w-4" />
                <span className="hidden 2xl:inline">Member card</span>
              </Link>
              <Link
                aria-label="Access requests"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                href="/dashboard/access-requests"
              >
                <KeyRound className="h-4 w-4" />
                <span className="hidden 2xl:inline">Requests</span>
              </Link>
              {canOpenAdminCenter ? (
                <Link
                  aria-label="Access control"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                  href="/dashboard/access-control"
                >
                  <DoorOpen className="h-4 w-4" />
                  <span className="hidden 2xl:inline">Access</span>
                </Link>
              ) : null}
              <Link
                aria-label={messages.aiAssistant}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                href="/dashboard/assistant"
              >
                <Sparkles className="h-4 w-4" />
                <span className="hidden 2xl:inline">{messages.aiAssistant}</span>
              </Link>
              <Link
                aria-label="Private board portal"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                href="/dashboard/board"
              >
                <FileLock2 className="h-4 w-4" />
                <span className="hidden 2xl:inline">Board</span>
              </Link>
              <Link
                aria-label="Internal news feed"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                href="/dashboard/news"
              >
                <Newspaper className="h-4 w-4" />
                <span className="hidden 2xl:inline">News</span>
              </Link>
              <Link
                aria-label={messages.requiredForms}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                href="/dashboard/compliance"
              >
                <ClipboardCheck className="h-4 w-4" />
                <span className="hidden 2xl:inline">{messages.requiredForms}</span>
              </Link>
              <Link
                aria-label={messages.calendar}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                href="/dashboard/calendar"
              >
                <CalendarDays className="h-4 w-4" />
                <span className="hidden 2xl:inline">{messages.calendar}</span>
              </Link>
              <Link
                aria-label={messages.analytics}
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
              <Link
                aria-label="Growth suite"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-medium text-ink transition hover:bg-ink/5"
                href="/dashboard/growth"
              >
                <Sprout className="h-4 w-4" />
                <span className="hidden 2xl:inline">Growth</span>
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
              <SignOutButton label={messages.signOut} />
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
