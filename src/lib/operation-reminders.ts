import { NotificationPriority } from "@prisma/client";

import { createNotification } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

const dayMs = 24 * 60 * 60 * 1000;

export async function scheduleOperationReminders() {
  const now = new Date();
  const [journeys, policyAssignments, overdueTickets] = await Promise.all([
    prisma.visitorJourney.findMany({
      where: {
        assignedToId: { not: null },
        reminderAt: { lte: now },
        stage: { notIn: ["COMPLETED", "INACTIVE"] }
      },
      take: 100
    }),
    prisma.policyAssignment.findMany({
      where: {
        acknowledgedAt: null,
        dueAt: { lte: new Date(now.getTime() + 3 * dayMs) },
        OR: [{ reminderSentAt: null }, { reminderSentAt: { lte: new Date(now.getTime() - dayMs) } }]
      },
      take: 200
    }),
    prisma.helpDeskTicket.findMany({
      where: {
        assigneeId: { not: null },
        responseDueAt: { lte: now },
        status: { notIn: ["RESOLVED", "CLOSED"] }
      },
      take: 100
    })
  ]);

  for (const journey of journeys) {
    if (!journey.assignedToId) continue;
    await createNotification({
      userId: journey.assignedToId,
      workspaceId: journey.workspaceId,
      type: "VISITOR_FOLLOW_UP_DUE",
      title: `Follow up with ${journey.firstName} ${journey.lastName}`,
      body: `Current stage: ${journey.stage.toLowerCase().replaceAll("_", " ")}`,
      href: "/dashboard/operations?tab=visitors",
      priority: NotificationPriority.HIGH
    });
    await prisma.visitorJourney.update({
      where: { id: journey.id },
      data: { reminderAt: null }
    });
  }

  for (const assignment of policyAssignments) {
    const policy = await prisma.policyDocument.findUnique({
      where: { id: assignment.policyId },
      select: { title: true, workspaceId: true }
    });
    if (!policy) continue;
    await createNotification({
      userId: assignment.userId,
      workspaceId: policy.workspaceId,
      type: "POLICY_REMINDER",
      title: `Policy acknowledgment due: ${policy.title}`,
      body: assignment.dueAt ? `Due ${assignment.dueAt.toLocaleDateString("en-GB")}` : null,
      href: "/dashboard/operations?tab=policies",
      priority: NotificationPriority.HIGH
    });
    await prisma.policyAssignment.update({
      where: { id: assignment.id },
      data: { reminderSentAt: now }
    });
  }

  for (const ticket of overdueTickets) {
    if (!ticket.assigneeId) continue;
    const href = "/dashboard/operations?tab=helpdesk";
    const recentAlert = await prisma.notification.findFirst({
      where: {
        userId: ticket.assigneeId,
        type: "HELP_DESK_OVERDUE",
        body: ticket.id,
        createdAt: { gte: new Date(now.getTime() - dayMs) }
      }
    });
    if (recentAlert) continue;
    await createNotification({
      userId: ticket.assigneeId,
      workspaceId: ticket.workspaceId,
      type: "HELP_DESK_OVERDUE",
      title: `Response overdue: ${ticket.subject}`,
      body: ticket.id,
      href,
      priority: ticket.priority === "URGENT" ? NotificationPriority.URGENT : NotificationPriority.HIGH
    });
  }

  return {
    visitorReminders: journeys.length,
    policyReminders: policyAssignments.length,
    overdueHelpDeskAlerts: overdueTickets.length
  };
}
