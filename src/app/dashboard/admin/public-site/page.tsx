import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays, ClipboardCheck, Globe2, Megaphone, Network, Radio, ShieldCheck } from "lucide-react";

import { auth } from "@/auth";
import { PublicSiteIntegrationPanel } from "@/components/dashboard/public-site-integration-panel";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";
import { formatDate } from "@/lib/utils";

function publicOrigin() {
  return (process.env.AUTH_URL ?? "https://sharepoints.letw.org").replace(/\/$/, "");
}

export default async function PublicSiteIntegrationPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (!(await hasAnyWorkspaceAdminRole(session.user.id))) {
    redirect("/dashboard");
  }

  const now = new Date();
  const feedToken = process.env.PUBLIC_SITE_FEED_TOKEN;
  const feedUrl = `${publicOrigin()}/api/public/letw-org/feed${feedToken ? `?token=${encodeURIComponent(feedToken)}` : ""}`;
  const [announcements, events, sermons, branches, forms] = await Promise.all([
    prisma.workspaceAnnouncement.findMany({
      where: { approvalStatus: "APPROVED", pinned: true, workspace: { deletedAt: null } },
      include: { workspace: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 8
    }),
    prisma.churchEvent.findMany({
      where: { endsAt: { gte: now } },
      orderBy: { startsAt: "asc" },
      take: 8
    }),
    prisma.sermonResource.findMany({
      where: { visibility: "PUBLIC" },
      orderBy: { createdAt: "desc" },
      take: 8
    }),
    prisma.organizationUnit.findMany({
      where: { active: true, type: { in: ["COUNTRY", "REGION", "BRANCH", "CHURCH", "MINISTRY"] } },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      take: 12
    }),
    prisma.workspaceForm.findMany({
      where: { status: "OPEN", workspace: { deletedAt: null } },
      include: { workspace: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 8
    })
  ]);
  const metrics = [
    ["Pinned approved announcements", announcements.length, Megaphone],
    ["Upcoming public events", events.length, CalendarDays],
    ["Public sermons", sermons.length, Radio],
    ["Branches and ministries", branches.length, Network],
    ["Open forms", forms.length, ClipboardCheck]
  ] as const;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <Globe2 className="h-4 w-4" />
              Public Website Integration
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Sync selected approved LETW content to letw.org</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
              The public feed exports only safe website-ready content: pinned approved announcements, upcoming events, public sermons,
              active branches/ministries, and open forms.
            </p>
          </div>
          <PublicSiteIntegrationPanel feedUrl={feedUrl} />
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        {metrics.map(([label, value, Icon]) => (
          <div className="rounded-lg border border-ink/10 bg-white p-4" key={label}>
            <Icon className="h-5 w-5 text-moss" />
            <p className="mt-3 text-2xl font-semibold text-ink">{value}</p>
            <p className="text-sm text-ink/55">{label}</p>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-ink/10 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <ShieldCheck className="h-4 w-4 text-moss" />
              Website safety rules
            </p>
            <p className="mt-1 text-xs text-ink/55">Only content matching these rules is exported.</p>
          </div>
          <Badge className="bg-mint">feed ready</Badge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          {[
            "Announcements must be approved and pinned.",
            "Events must still be upcoming.",
            "Sermons must be marked PUBLIC.",
            "Branches and ministries must be active.",
            "Forms must be OPEN."
          ].map((rule) => (
            <div className="rounded-md bg-paper p-3 text-sm leading-6 text-ink/65" key={rule}>{rule}</div>
          ))}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-lg border border-ink/10 bg-white">
          <div className="border-b border-ink/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Website-ready announcements</h2>
          </div>
          <div className="divide-y divide-ink/10">
            {announcements.length === 0 ? <p className="px-4 py-8 text-sm text-ink/55">No pinned approved announcements yet.</p> : null}
            {announcements.map((announcement) => (
              <div className="px-4 py-3" key={announcement.id}>
                <p className="text-sm font-medium text-ink">{announcement.title}</p>
                <p className="mt-1 text-xs text-ink/50">
                  {announcement.workspace.name} - {formatDate(announcement.createdAt)}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-ink/10 bg-white">
          <div className="border-b border-ink/10 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">Upcoming website events</h2>
          </div>
          <div className="divide-y divide-ink/10">
            {events.length === 0 ? <p className="px-4 py-8 text-sm text-ink/55">No upcoming events yet.</p> : null}
            {events.map((event) => (
              <div className="px-4 py-3" key={event.id}>
                <p className="text-sm font-medium text-ink">{event.title}</p>
                <p className="mt-1 text-xs text-ink/50">
                  {event.eventType.toLowerCase()} - {event.location ?? "Location pending"} - {formatDate(event.startsAt)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-ink/10 bg-white p-4">
        <p className="text-sm font-semibold text-ink">How to use on letw.org</p>
        <p className="mt-2 text-sm leading-6 text-ink/60">
          In the public website, fetch the feed URL above from the server side, then render the returned JSON sections. Keep the token on
          the server, not inside browser JavaScript.
        </p>
        <Link className="mt-4 inline-flex h-10 items-center rounded-md border border-ink/10 px-4 text-sm font-medium hover:bg-mint/40" href="/dashboard/admin">
          Back to admin center
        </Link>
      </section>
    </div>
  );
}
