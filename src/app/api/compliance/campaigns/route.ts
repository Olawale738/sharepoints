import { ComplianceAudienceType, NotificationPriority } from "@prisma/client";
import { z } from "zod";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { resolveComplianceRecipients } from "@/lib/compliance";
import { isMemberEditableProfileField } from "@/lib/member-profile-fields";
import { notifyUsers } from "@/lib/notifications";
import { deliverPendingNotifications } from "@/lib/notification-delivery";
import { prisma } from "@/lib/prisma";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

const campaignSchema = z.object({
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(5_000).optional().default(""),
  requiredFields: z.array(z.string()).min(1).max(15),
  audienceType: z.enum(["ALL_ACTIVE", "DEPARTMENT", "WORKSPACE", "SELECTED"]),
  audienceReferenceId: z.string().cuid().nullable().optional(),
  selectedUserIds: z.array(z.string().cuid()).max(500).optional().default([]),
  dueAt: z.string().datetime(),
  requiresReview: z.boolean().default(true),
  allowCareException: z.boolean().default(true),
  reminderIntervalDays: z.number().int().min(1).max(30).default(3),
  launchNow: z.boolean().default(true)
});

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    await requireAnyWorkspaceAdmin(actor.id, "Only administrators can create required member forms.");
    const parsed = campaignSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid campaign.");
    const requiredFields = parsed.data.requiredFields.filter(isMemberEditableProfileField);
    if (requiredFields.length !== parsed.data.requiredFields.length) {
      throw new ApiError(422, "One or more requested profile fields cannot be completed by members.");
    }
    const dueAt = new Date(parsed.data.dueAt);
    if (dueAt.getTime() <= Date.now()) throw new ApiError(422, "The deadline must be in the future.");
    if (
      (parsed.data.audienceType === ComplianceAudienceType.DEPARTMENT ||
        parsed.data.audienceType === ComplianceAudienceType.WORKSPACE) &&
      !parsed.data.audienceReferenceId
    ) {
      throw new ApiError(422, "Choose the department or workspace audience.");
    }
    if (parsed.data.audienceType === ComplianceAudienceType.SELECTED && !parsed.data.selectedUserIds.length) {
      throw new ApiError(422, "Choose at least one member.");
    }

    const recipients = await resolveComplianceRecipients({
      audienceType: parsed.data.audienceType,
      audienceReferenceId: parsed.data.audienceReferenceId,
      selectedUserIds: parsed.data.selectedUserIds
    });
    if (!recipients.length) throw new ApiError(422, "No active members match this audience.");
    const campaign = await prisma.memberComplianceCampaign.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description || null,
        requiredFields,
        audienceType: parsed.data.audienceType,
        audienceReferenceId: parsed.data.audienceReferenceId ?? null,
        dueAt,
        requiresReview: parsed.data.requiresReview,
        allowCareException: parsed.data.allowCareException,
        reminderIntervalDays: parsed.data.reminderIntervalDays,
        createdById: actor.id,
        status: parsed.data.launchNow ? "ACTIVE" : "DRAFT",
        launchedAt: parsed.data.launchNow ? new Date() : null,
        assignments: {
          create: recipients.map((recipient) => ({ userId: recipient.id }))
        }
      },
      include: {
        assignments: true,
        createdBy: { select: { name: true, email: true } }
      }
    });

    await logActivity({
      userId: actor.id,
      action: parsed.data.launchNow ? activityActions.complianceCampaignLaunched : activityActions.complianceCampaignCreated,
      targetId: campaign.id,
      metadata: { title: campaign.title, recipients: recipients.length }
    });
    if (parsed.data.launchNow) {
      const notifications = await notifyUsers(
        recipients.map((recipient) => recipient.id),
        {
          type: "REQUIRED_MEMBER_FORM",
          title: `Required: ${campaign.title}`,
          body: `Please complete your LETW member information by ${dueAt.toLocaleDateString("en-GB")}.`,
          href: "/dashboard/compliance",
          priority: NotificationPriority.HIGH
        }
      );
      if (notifications?.length) {
        await deliverPendingNotifications(notifications.slice(0, 25).map((notification) => notification.id));
      }
    }

    return ok({ campaign }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
