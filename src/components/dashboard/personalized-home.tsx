import Link from "next/link";
import {
  Bell,
  CalendarCheck,
  CalendarDays,
  CheckSquare,
  FileCheck2,
  Files,
  LifeBuoy,
  ShieldCheck
} from "lucide-react";

import { Badge } from "@/components/ui/badge";

type HomeItem = {
  id: string;
  title: string;
  detail: string;
  href: string;
};

export function PersonalizedHome({
  meetings,
  notifications,
  tasks,
  recentFiles,
  upcomingEvents,
  counts
}: {
  meetings: HomeItem[];
  notifications: HomeItem[];
  tasks: HomeItem[];
  recentFiles: HomeItem[];
  upcomingEvents: HomeItem[];
  counts: {
    unread: number;
    approvals: number;
    policies: number;
    helpdesk: number;
    duties: number;
  };
}) {
  const actions = [
    { label: "Unread", value: counts.unread, href: "/dashboard", icon: Bell },
    { label: "Approvals", value: counts.approvals, href: "/dashboard", icon: FileCheck2 },
    { label: "Policies", value: counts.policies, href: "/dashboard/operations?tab=policies", icon: ShieldCheck },
    { label: "Help requests", value: counts.helpdesk, href: "/dashboard/operations?tab=helpdesk", icon: LifeBuoy },
    { label: "Upcoming duties", value: counts.duties, href: "/dashboard/operations?tab=staff", icon: CalendarCheck }
  ];
  const sections = [
    { title: "Upcoming meetings", items: meetings, icon: CalendarDays, empty: "No upcoming meetings." },
    { title: "Assigned tasks", items: tasks, icon: CheckSquare, empty: "No active assigned tasks." },
    { title: "Recent documents", items: recentFiles, icon: Files, empty: "No recent documents." },
    { title: "Events", items: upcomingEvents, icon: CalendarCheck, empty: "No upcoming events." }
  ];

  return (
    <section className="space-y-4 rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-moss">My LETW day</p>
          <h2 className="mt-1 text-xl font-semibold">What needs your attention</h2>
        </div>
        <Badge className="bg-mint">Personalized</Badge>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        {actions.map(({ label, value, href, icon: Icon }) => (
          <Link key={label} className="rounded-md bg-paper p-3 transition hover:bg-mint/50" href={href}>
            <Icon className="h-4 w-4 text-moss" />
            <p className="mt-2 text-xl font-semibold">{value}</p>
            <p className="text-xs text-ink/55">{label}</p>
          </Link>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        {sections.map(({ title, items, icon: Icon, empty }) => (
          <div key={title} className="border-t border-ink/10 pt-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Icon className="h-4 w-4 text-moss" />
              {title}
            </h3>
            <div className="mt-2 space-y-1">
              {items.slice(0, 4).map((item) => (
                <Link key={item.id} className="block rounded-md px-2 py-2 text-sm hover:bg-mint/40" href={item.href}>
                  <span className="block truncate font-medium">{item.title}</span>
                  <span className="block truncate text-xs text-ink/50">{item.detail}</span>
                </Link>
              ))}
              {!items.length ? <p className="px-2 py-2 text-xs text-ink/45">{empty}</p> : null}
            </div>
          </div>
        ))}
      </div>
      {notifications.length ? (
        <div className="border-t border-ink/10 pt-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Bell className="h-4 w-4 text-moss" />
            Latest unread updates
          </h3>
          <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {notifications.slice(0, 6).map((item) => (
              <Link key={item.id} className="rounded-md bg-paper px-3 py-2 text-sm hover:bg-mint/50" href={item.href}>
                <span className="block truncate font-medium">{item.title}</span>
                <span className="block truncate text-xs text-ink/50">{item.detail}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
