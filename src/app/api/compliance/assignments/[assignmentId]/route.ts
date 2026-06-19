import { NotificationPriority } from "@prisma/client";
import { z } from "zod";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import {
  isMemberEditableProfileField,
  profileUpdateFromAnswers,
  type MemberEditableProfileField
} from "@/lib/member-profile-fields";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

const memberActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("SUBMIT"),
    answers: z.record(z.union([z.string().max(2_000), z.array(z.string().max(160)).max(30)]))
  }),
  z.object({
    action: z.literal("REQUEST_EXCEPTION"),
    category: z.enum(["HEALTH", "CARE", "ACCESSIBILITY", "TRAVEL", "TECHNICAL", "OTHER"]),
    note: z.string().trim().min(3).max(2_000)
  })
]);

const adminActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ADMIN_EDIT"),
    answers: z.record(z.union([z.string().max(2_000), z.array(z.string().max(160)).max(30)])),
    note: z.string().trim().max(2_000).optional().default("")
  }),
  z.object({ action: z.literal("APPROVE"), note: z.string().trim().max(2_000).optional().default("") }),
  z.object({ action: z.literal("REQUEST_CHANGES"), note: z.string().trim().min(3).max(2_000) }),
  z.object({ action: z.literal("EXEMPT"), note: z.string().trim().min(3).max(2_000) }),
  z.object({
    action: z.literal("SANCTION"),
    sanctionType: z.enum(["WARNING", "RESTRICT_CHAT", "RESTRICT_FILES"]),
    reason: z.string().trim().min(3).max(2_000),
    expiresAt: z.string().datetime().nullable().optional()
  })
]);

function validateAnswers(fields: MemberEditableProfileField[], answers: Record<string, string | string[]>) {
  for (const field of fields) {
    const value = answers[field];
    if (
      value === undefined ||
      value === null ||
      (typeof value === "string" && !value.trim()) ||
      (Array.isArray(value) && value.length === 0)
    ) {
      throw new ApiError(422, "Please complete every required field.");
    }
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ assignmentId: string }> }) {
  try {
    const actor = await requireUser();
    const { assignmentId } = await context.params;
    const body = await request.json();
    const assignment = await prisma.memberComplianceAssignment.findUnique({
      where: { id: assignmentId },
      include: {
        campaign: true,
        user: {
          select: {
            id: true,
            email: true,
            workspaceMemberships: { select: { role: true } }
          }
        }
      }
    });
    if (!assignment) throw new ApiError(404, "Required form assignment not found.");
    const isOwner = assignment.userId === actor.id;

    if (isOwner) {
      const parsed = memberActionSchema.safeParse(body);
      if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid form action.");
      if (assignment.campaign.status !== "ACTIVE") throw new ApiError(409, "This information request is closed.");
      if (parsed.data.action === "REQUEST_EXCEPTION") {
        if (!assignment.campaign.allowCareException) throw new ApiError(409, "This request does not accept care exceptions.");
        const updated = await prisma.memberComplianceAssignment.update({
          where: { id: assignment.id },
          data: {
            exceptionRequestedAt: new Date(),
            exceptionCategory: parsed.data.category,
            exceptionNote: parsed.data.note
          }
        });
        const admins = await prisma.workspaceMember.findMany({
          where: { role: "ADMIN" },
          distinct: ["userId"],
          select: { userId: true }
        });
        await notifyUsers(
          admins.map((admin) => admin.userId),
          {
            type: "COMPLIANCE_EXCEPTION_REQUESTED",
            title: "Care exception requested",
            body: `${assignment.user.email ?? "A member"} requested private consideration for ${assignment.campaign.title}.`,
            href: "/dashboard/compliance",
            priority: NotificationPriority.HIGH
          }
        );
        return ok({ assignment: updated });
      }

      const submitData = parsed.data;
      const fields = (assignment.campaign.requiredFields as string[]).filter(
        isMemberEditableProfileField
      ) as MemberEditableProfileField[];
      validateAnswers(fields, submitData.answers);
      const completionPercent = Math.round(
        (fields.filter((field) => {
          const value = submitData.answers[field];
          return Array.isArray(value) ? value.length > 0 : Boolean(value?.trim());
        }).length /
          fields.length) *
          100
      );
      const nextStatus = assignment.campaign.requiresReview ? "SUBMITTED" : "APPROVED";
      const updateData = profileUpdateFromAnswers(fields, submitData.answers);
      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.memberComplianceAssignment.update({
          where: { id: assignment.id },
          data: {
            answers: submitData.answers,
            completionPercent,
            submittedAt: new Date(),
            status: nextStatus,
            reviewNote: null
          }
        });
        if (!assignment.campaign.requiresReview) {
          await tx.memberProfile.upsert({
            where: { userId: actor.id },
            update: updateData,
            create: { userId: actor.id, ...updateData }
          });
        }
        return next;
      });
      await logActivity({
        userId: actor.id,
        action: activityActions.complianceFormSubmitted,
        targetId: assignment.id,
        metadata: { campaignId: assignment.campaignId, title: assignment.campaign.title }
      });
      return ok({ assignment: updated });
    }

    await requireAnyWorkspaceAdmin(actor.id, "Only administrators can review member information.");
    const parsed = adminActionSchema.safeParse(body);
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid review action.");
    const targetIsAdmin = assignment.user.workspaceMemberships.some((membership) => membership.role === "ADMIN");
    if (parsed.data.action === "ADMIN_EDIT") {
      const editData = parsed.data;
      if (!assignment.answers) throw new ApiError(409, "This member has not submitted information yet.");
      const fields = (assignment.campaign.requiredFields as string[]).filter(
        isMemberEditableProfileField
      ) as MemberEditableProfileField[];
      validateAnswers(fields, editData.answers);
      const profileData = profileUpdateFromAnswers(fields, editData.answers);
      const updated = await prisma.$transaction(async (tx) => {
        if (assignment.status === "APPROVED") {
          await tx.memberProfile.upsert({
            where: { userId: assignment.userId },
            update: profileData,
            create: { userId: assignment.userId, ...profileData }
          });
        }
        return tx.memberComplianceAssignment.update({
          where: { id: assignment.id },
          data: {
            answers: editData.answers,
            completionPercent: 100,
            submittedAt: assignment.submittedAt ?? new Date(),
            reviewedById: actor.id,
            reviewedAt: new Date(),
            reviewNote: editData.note || assignment.reviewNote
          }
        });
      });
      await logActivity({
        userId: actor.id,
        action: activityActions.complianceFormEdited,
        targetId: assignment.id,
        metadata: { campaignId: assignment.campaignId, targetUserId: assignment.userId }
      });
      return ok({ assignment: updated });
    }
    if (parsed.data.action === "SANCTION") {
      const sanctionData = parsed.data;
      if (targetIsAdmin) throw new ApiError(409, "Administrator accounts cannot be sanctioned.");
      if (!["PENDING", "CHANGES_REQUESTED"].includes(assignment.status)) {
        throw new ApiError(409, "Only an incomplete overdue assignment can receive a sanction.");
      }
      if (assignment.exceptionRequestedAt) {
        throw new ApiError(409, "Resolve the member's private care exception before applying a sanction.");
      }
      if (assignment.campaign.dueAt.getTime() > Date.now()) {
        throw new ApiError(409, "A sanction cannot be applied before the deadline.");
      }
      const sanction = await prisma.$transaction(async (tx) => {
        const created = await tx.memberSanction.create({
          data: {
            userId: assignment.userId,
            assignmentId: assignment.id,
            type: sanctionData.sanctionType,
            reason: sanctionData.reason,
            issuedById: actor.id,
            expiresAt: sanctionData.expiresAt ? new Date(sanctionData.expiresAt) : null
          }
        });
        await tx.memberComplianceAssignment.update({
          where: { id: assignment.id },
          data: { status: "SANCTIONED", reviewedById: actor.id, reviewedAt: new Date(), reviewNote: sanctionData.reason }
        });
        await tx.securityEvent.create({
          data: {
            userId: assignment.userId,
            email: assignment.user.email,
            type: "MEMBER_SANCTION_ISSUED",
            metadata: {
              sanctionId: created.id,
              assignmentId: assignment.id,
              campaignId: assignment.campaignId,
              sanctionType: sanctionData.sanctionType,
              issuedById: actor.id
            }
          }
        });
        return created;
      });
      await notifyUsers([assignment.userId], {
        type: "MEMBER_SANCTION",
        title: "Account restriction applied",
        body: sanctionData.reason,
        href: "/dashboard/compliance",
        priority: NotificationPriority.URGENT
      });
      await logActivity({
        userId: actor.id,
        action: activityActions.memberSanctionIssued,
        targetId: sanction.id,
        metadata: { targetUserId: assignment.userId, type: sanction.type }
      });
      return ok({ sanction });
    }

    if (parsed.data.action === "APPROVE") {
      const approveData = parsed.data;
      if (!assignment.answers) throw new ApiError(409, "The member has not submitted this form.");
      const fields = (assignment.campaign.requiredFields as string[]).filter(
        isMemberEditableProfileField
      ) as MemberEditableProfileField[];
      const answers = assignment.answers as Record<string, string | string[]>;
      const profileData = profileUpdateFromAnswers(fields, answers);
      const updated = await prisma.$transaction(async (tx) => {
        await tx.memberProfile.upsert({
          where: { userId: assignment.userId },
          update: profileData,
          create: { userId: assignment.userId, ...profileData }
        });
        return tx.memberComplianceAssignment.update({
          where: { id: assignment.id },
          data: {
            status: "APPROVED",
            reviewedAt: new Date(),
            reviewedById: actor.id,
            reviewNote: approveData.note || null
          }
        });
      });
      await notifyUsers([assignment.userId], {
        type: "COMPLIANCE_APPROVED",
        title: `${assignment.campaign.title} approved`,
        body: "Your LETW member information has been reviewed and approved.",
        href: "/dashboard/compliance"
      });
      return ok({ assignment: updated });
    }

    const reviewData = parsed.data;
    const nextStatus = reviewData.action === "EXEMPT" ? "EXEMPT" : "CHANGES_REQUESTED";
    const updated = await prisma.memberComplianceAssignment.update({
      where: { id: assignment.id },
      data: {
        status: nextStatus,
        reviewedAt: new Date(),
        reviewedById: actor.id,
        reviewNote: reviewData.note,
        ...(reviewData.action === "REQUEST_CHANGES"
          ? {
              exceptionRequestedAt: null,
              exceptionCategory: null,
              exceptionNote: null
            }
          : {})
      }
    });
    await notifyUsers([assignment.userId], {
      type: nextStatus === "EXEMPT" ? "COMPLIANCE_EXEMPTED" : "COMPLIANCE_CHANGES_REQUESTED",
      title: nextStatus === "EXEMPT" ? "Care exception approved" : "Member form needs changes",
      body: reviewData.note,
      href: "/dashboard/compliance",
      priority: nextStatus === "EXEMPT" ? NotificationPriority.NORMAL : NotificationPriority.HIGH
    });
    await logActivity({
      userId: actor.id,
      action: activityActions.complianceAssignmentReviewed,
      targetId: assignment.id,
      metadata: { status: nextStatus, targetUserId: assignment.userId }
    });
    return ok({ assignment: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ assignmentId: string }> }) {
  try {
    const actor = await requireUser();
    await requireAnyWorkspaceAdmin(actor.id, "Only administrators can delete submitted member forms.");
    const { assignmentId } = await context.params;
    const assignment = await prisma.memberComplianceAssignment.findUnique({
      where: { id: assignmentId },
      include: { campaign: { select: { id: true, title: true } } }
    });
    if (!assignment) throw new ApiError(404, "Required form assignment not found.");
    if (!assignment.answers && !assignment.submittedAt) {
      throw new ApiError(409, "This assignment has no submitted response to delete.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.memberSanction.updateMany({
        where: { assignmentId: assignment.id },
        data: { assignmentId: null }
      });
      await tx.memberComplianceAssignment.delete({ where: { id: assignment.id } });
      await tx.securityEvent.create({
        data: {
          userId: actor.id,
          email: actor.email,
          type: "COMPLIANCE_RESPONSE_DELETED",
          metadata: {
            operation: "COMPLIANCE_RESPONSE_DELETED",
            assignmentId: assignment.id,
            campaignId: assignment.campaign.id,
            targetUserId: assignment.userId
          }
        }
      });
    });
    await logActivity({
      userId: actor.id,
      action: activityActions.complianceFormDeleted,
      targetId: assignment.id,
      metadata: { campaignId: assignment.campaign.id, targetUserId: assignment.userId }
    });
    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
