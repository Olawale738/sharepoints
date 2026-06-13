import { NotificationPriority } from "@prisma/client";
import { z } from "zod";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { notifyUsers } from "@/lib/notifications";
import { deliverPendingNotifications } from "@/lib/notification-delivery";
import { prisma } from "@/lib/prisma";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

const actionSchema = z.object({
  action: z.enum(["LAUNCH", "REMIND", "CLOSE"])
});

export async function PATCH(request: Request, context: { params: Promise<{ campaignId: string }> }) {
  try {
    const actor = await requireUser();
    await requireAnyWorkspaceAdmin(actor.id, "Only administrators can manage required forms.");
    const { campaignId } = await context.params;
    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, "Invalid campaign action.");
    const campaign = await prisma.memberComplianceCampaign.findUnique({
      where: { id: campaignId },
      include: { assignments: true }
    });
    if (!campaign) throw new ApiError(404, "Required form campaign not found.");
    if (parsed.data.action === "CLOSE") {
      const updated = await prisma.memberComplianceCampaign.update({
        where: { id: campaign.id },
        data: { status: "CLOSED", closedAt: new Date() }
      });
      return ok({ campaign: updated });
    }

    const pending = campaign.assignments.filter((assignment) =>
      ["PENDING", "CHANGES_REQUESTED", "SANCTIONED"].includes(assignment.status)
    );
    if (parsed.data.action === "LAUNCH") {
      if (campaign.status !== "DRAFT") throw new ApiError(409, "This campaign has already been launched.");
      await prisma.memberComplianceCampaign.update({
        where: { id: campaign.id },
        data: { status: "ACTIVE", launchedAt: new Date() }
      });
      await logActivity({
        userId: actor.id,
        action: activityActions.complianceCampaignLaunched,
        targetId: campaign.id,
        metadata: { recipients: campaign.assignments.length }
      });
    } else if (campaign.status !== "ACTIVE") {
      throw new ApiError(409, "Only active campaigns can send reminders.");
    }

    const recipients = parsed.data.action === "LAUNCH" ? campaign.assignments : pending;
    const notifications = await notifyUsers(
      recipients.map((assignment) => assignment.userId),
      {
        type: parsed.data.action === "LAUNCH" ? "REQUIRED_MEMBER_FORM" : "REQUIRED_MEMBER_FORM_REMINDER",
        title: `${parsed.data.action === "REMIND" ? "Reminder: " : "Required: "}${campaign.title}`,
        body: `Please complete your LETW member information by ${campaign.dueAt.toLocaleDateString("en-GB")}.`,
        href: "/dashboard/compliance",
        priority: NotificationPriority.HIGH
      }
    );
    if (notifications?.length) {
      await deliverPendingNotifications(notifications.slice(0, 25).map((notification) => notification.id));
    }
    if (parsed.data.action === "REMIND" && pending.length) {
      await prisma.memberComplianceAssignment.updateMany({
        where: { id: { in: pending.map((assignment) => assignment.id) } },
        data: { reminderCount: { increment: 1 }, lastReminderAt: new Date() }
      });
    }
    return ok({ updated: true, notified: recipients.length });
  } catch (error) {
    return handleRouteError(error);
  }
}
