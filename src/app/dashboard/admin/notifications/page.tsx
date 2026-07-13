import Link from "next/link";
import { redirect } from "next/navigation";
import { BellRing } from "lucide-react";

import { auth } from "@/auth";
import { AdminNotificationBroadcastPanel } from "@/components/dashboard/admin-notification-broadcast-panel";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";
import { formatDate } from "@/lib/utils";

export default async function AdminNotificationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await hasAnyWorkspaceAdminRole(session.user.id))) redirect("/dashboard");

  const [users, workspaces, units, recentBroadcasts] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null, suspendedAt: null, accessRevokedAt: null, email: { endsWith: "@letw.org" } },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      take: 5000
    }),
    prisma.workspace.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 1000
    }),
    prisma.organizationUnit.findMany({
      where: { active: true },
      select: { id: true, name: true, type: true, code: true },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      take: 1000
    }),
    prisma.notification.findMany({
      where: { type: { in: ["ADMIN_BROADCAST", "EMERGENCY_BROADCAST"] } },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 25
    })
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <BellRing className="h-4 w-4" />
              WhatsApp / email notification center
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Send controlled LETW broadcasts</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
              Reach active invited members by organization unit, workspace, role, or individual account. Every broadcast is permission-aware,
              creates an in-app notification, and records an activity audit.
            </p>
          </div>
          <Link className="inline-flex h-10 items-center rounded-md border border-ink/10 bg-paper px-4 text-sm font-medium hover:bg-mint/40" href="/dashboard/admin">
            Back to admin
          </Link>
        </div>
      </section>

      <AdminNotificationBroadcastPanel
        users={users.map((user) => ({ id: user.id, name: user.name ?? user.email ?? "LETW member", detail: user.email }))}
        workspaces={workspaces.map((workspace) => ({ id: workspace.id, name: workspace.name }))}
        units={units.map((unit) => ({ id: unit.id, name: unit.name, detail: `${unit.type.toLowerCase()}${unit.code ? ` - ${unit.code}` : ""}` }))}
      />

      <section className="rounded-lg border border-ink/10 bg-white shadow-soft">
        <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Recent broadcast deliveries</h2>
          <Badge>{recentBroadcasts.length}</Badge>
        </div>
        <div className="divide-y divide-ink/10">
          {recentBroadcasts.length === 0 ? <p className="px-4 py-8 text-sm text-ink/55">No broadcasts have been sent yet.</p> : null}
          {recentBroadcasts.map((notification) => (
            <div className="px-4 py-3" key={notification.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-ink">{notification.title}</p>
                <Badge>{notification.priority.toLowerCase()}</Badge>
              </div>
              <p className="mt-1 text-xs text-ink/55">
                To {notification.user.name ?? notification.user.email ?? "member"} - {formatDate(notification.createdAt)}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
