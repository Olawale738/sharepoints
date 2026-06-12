import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { UnifiedCalendar } from "@/components/dashboard/unified-calendar";
import { getAdminVisibleWorkspaceIds } from "@/lib/governance";
import { prisma } from "@/lib/prisma";

export default async function CalendarPage() {
  const session = await auth();

  if (!session?.user?.id) redirect("/login");
  const workspaceIds = await getAdminVisibleWorkspaceIds(session.user.id);
  const [meetings, tasks] = await Promise.all([
    prisma.workspaceMeeting.findMany({
      where: {
        workspaceId: { in: workspaceIds },
        approvalStatus: "APPROVED",
        cancelledAt: null
      },
      select: {
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        meetingType: true,
        workspaceId: true,
        workspace: { select: { name: true } }
      },
      orderBy: { startsAt: "asc" },
      take: 500
    }),
    prisma.workspaceTask.findMany({
      where: {
        workspaceId: { in: workspaceIds },
        approvalStatus: "APPROVED",
        dueDate: { not: null }
      },
      select: {
        id: true,
        title: true,
        dueDate: true,
        priority: true,
        workspaceId: true,
        workspace: { select: { name: true } }
      },
      orderBy: { dueDate: "asc" },
      take: 500
    })
  ]);

  const events = [
    ...meetings.map((meeting) => ({
      id: meeting.id,
      type: "meeting" as const,
      title: meeting.title,
      workspace: meeting.workspace.name,
      workspaceId: meeting.workspaceId,
      startsAt: meeting.startsAt.toISOString(),
      endsAt: meeting.endsAt.toISOString(),
      detail: meeting.meetingType
    })),
    ...tasks.flatMap((task) =>
      task.dueDate
        ? [{
            id: task.id,
            type: "task" as const,
            title: task.title,
            workspace: task.workspace.name,
            workspaceId: task.workspaceId,
            startsAt: task.dueDate.toISOString(),
            detail: task.priority
          }]
        : []
    )
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold">LETW calendar</h1>
        <p className="mt-2 text-sm text-ink/60">Meetings, calls, task deadlines, and reminders across your workspaces.</p>
      </div>
      <UnifiedCalendar events={events} />
    </div>
  );
}
