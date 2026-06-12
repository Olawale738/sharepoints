import { redirect } from "next/navigation";
import { Activity, Database, FileText, MessageSquareText, UsersRound, Video } from "lucide-react";

import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { getAdminVisibleWorkspaceIds } from "@/lib/governance";
import { prisma } from "@/lib/prisma";
import { formatBytes } from "@/lib/utils";

export default async function AnalyticsPage() {
  const session = await auth();

  if (!session?.user?.id) redirect("/login");
  const workspaceIds = await getAdminVisibleWorkspaceIds(session.user.id);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [users, fileStats, channelMessages, directMessages, meetings, activity, workspaces] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId: { in: workspaceIds } },
      distinct: ["userId"],
      select: { userId: true }
    }),
    prisma.file.aggregate({
      where: { workspaceId: { in: workspaceIds }, deletedAt: null },
      _count: { id: true },
      _sum: { size: true }
    }),
    prisma.chatMessage.count({
      where: {
        channel: { workspaceId: { in: workspaceIds } },
        createdAt: { gte: since },
        deletedAt: null
      }
    }),
    prisma.directMessage.count({
      where: {
        conversation: { workspaceId: { in: workspaceIds } },
        createdAt: { gte: since },
        deletedAt: null
      }
    }),
    prisma.workspaceMeeting.count({
      where: {
        workspaceId: { in: workspaceIds },
        startsAt: { gte: since }
      }
    }),
    prisma.activityLog.findMany({
      where: {
        workspaceId: { in: workspaceIds },
        createdAt: { gte: since }
      },
      select: { createdAt: true }
    }),
    prisma.workspace.findMany({
      where: { id: { in: workspaceIds }, deletedAt: null },
      include: {
        _count: {
          select: { members: true, files: true, tasks: true, meetings: true, chatChannels: true }
        }
      },
      orderBy: { name: "asc" }
    })
  ]);

  const dayCounts = Array.from({ length: 30 }, (_, index) => {
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - (29 - index));
    const next = new Date(day);
    next.setDate(next.getDate() + 1);
    return {
      label: day.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      count: activity.filter((item) => item.createdAt >= day && item.createdAt < next).length
    };
  });
  const maxActivity = Math.max(1, ...dayCounts.map((day) => day.count));
  const metrics = [
    { label: "Active members", value: users.length, icon: UsersRound },
    { label: "Documents", value: fileStats._count.id, detail: formatBytes(fileStats._sum.size ?? 0), icon: FileText },
    { label: "Messages in 30 days", value: channelMessages + directMessages, icon: MessageSquareText },
    { label: "Meetings in 30 days", value: meetings, icon: Video }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Analytics</h1>
        <p className="mt-2 text-sm text-ink/60">Adoption, storage, communication, and workspace activity.</p>
      </div>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-lg border border-ink/10 bg-white p-4">
            <metric.icon className="h-5 w-5 text-moss" />
            <p className="mt-4 text-3xl font-semibold">{metric.value}</p>
            <p className="text-sm text-ink/55">{metric.label}</p>
            {metric.detail ? <p className="mt-1 text-xs text-ink/40">{metric.detail}</p> : null}
          </div>
        ))}
      </section>
      <section className="rounded-lg border border-ink/10 bg-white p-4">
        <div className="mb-4 flex items-center gap-2">
          <Activity className="h-4 w-4 text-moss" />
          <h2 className="text-sm font-semibold">30-day activity</h2>
        </div>
        <div className="flex h-48 items-end gap-1">
          {dayCounts.map((day) => (
            <div key={day.label} className="group relative flex min-w-0 flex-1 items-end">
              <div
                className="w-full rounded-t bg-moss/80 transition hover:bg-moss"
                style={{ height: `${Math.max(4, (day.count / maxActivity) * 100)}%` }}
                title={`${day.label}: ${day.count} activities`}
              />
            </div>
          ))}
        </div>
      </section>
      <section className="overflow-hidden rounded-lg border border-ink/10 bg-white">
        <div className="flex items-center gap-2 border-b border-ink/10 px-4 py-3">
          <Database className="h-4 w-4 text-moss" />
          <h2 className="text-sm font-semibold">Workspace comparison</h2>
        </div>
        <div className="divide-y divide-ink/10">
          {workspaces.map((workspace) => (
            <div key={workspace.id} className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[1fr_repeat(5,auto)] md:items-center">
              <p className="font-medium">{workspace.name}</p>
              <Badge>{workspace._count.members} members</Badge>
              <Badge>{workspace._count.files} files</Badge>
              <Badge>{workspace._count.tasks} tasks</Badge>
              <Badge>{workspace._count.meetings} meetings</Badge>
              <Badge>{workspace._count.chatChannels} channels</Badge>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
