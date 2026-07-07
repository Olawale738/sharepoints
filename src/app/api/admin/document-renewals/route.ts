import { DocumentExpiryStatus, NotificationPriority } from "@prisma/client";
import { z } from "zod";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export const runtime = "nodejs";

const actionSchema = z.object({
  itemId: z.string().cuid(),
  action: z.enum(["REMIND", "REVIEWED", "RENEW_1_YEAR", "MARK_EXPIRED", "ARCHIVE", "DELETE"]),
  note: z.string().trim().max(1000).optional().nullable()
});

function addMonths(value: Date, months: number) {
  const next = new Date(value);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

async function getFallbackAdminIds(workspaceId?: string | null) {
  if (workspaceId) {
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId, role: "ADMIN", user: { deletedAt: null, accessRevokedAt: null, suspendedAt: null } },
      select: { userId: true },
      take: 50
    });
    if (members.length) return members.map((member) => member.userId);
  }

  const admins = await prisma.workspaceMember.findMany({
    where: { role: "ADMIN", user: { deletedAt: null, accessRevokedAt: null, suspendedAt: null } },
    select: { userId: true },
    distinct: ["userId"],
    take: 100
  });
  return admins.map((member) => member.userId);
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireUser();
    if (!(await hasAnyWorkspaceAdminRole(actor.id))) {
      throw new ApiError(403, "Only administrators can manage document renewals.");
    }

    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid renewal action.");
    }

    const { itemId, action, note } = parsed.data;
    const item = await prisma.documentExpiryItem.findUnique({ where: { id: itemId } });
    if (!item) throw new ApiError(404, "Document renewal item not found.");

    if (action === "REMIND") {
      const recipientIds = item.ownerId ? [item.ownerId] : await getFallbackAdminIds(item.workspaceId);
      await notifyUsers(recipientIds.length ? recipientIds : [actor.id], {
        workspaceId: item.workspaceId,
        type: "DOCUMENT_RENEWAL_REMINDER",
        title: `Review required: ${item.title}`,
        body:
          note ??
          `Please review or renew this ${item.targetType.toLowerCase()} record in the LETW document renewal workflow.`,
        href: "/dashboard/admin/document-renewals",
        priority: NotificationPriority.HIGH
      });
      await logActivity({
        userId: actor.id,
        workspaceId: item.workspaceId ?? undefined,
        action: activityActions.documentExpiryUpdated,
        targetId: item.id,
        metadata: { workflowAction: action, reminderRecipients: recipientIds.length }
      });
      return ok({ reminded: true, itemId, recipients: recipientIds.length || 1 });
    }

    if (action === "DELETE") {
      await prisma.documentExpiryItem.delete({ where: { id: itemId } });
      await logActivity({
        userId: actor.id,
        workspaceId: item.workspaceId ?? undefined,
        action: activityActions.documentExpiryDeleted,
        targetId: item.id,
        metadata: { workflowAction: action, title: item.title }
      });
      return ok({ deleted: true, itemId });
    }

    const now = new Date();
    const data =
      action === "RENEW_1_YEAR"
        ? {
            status: DocumentExpiryStatus.RENEWED,
            reviewDueAt: addMonths(now, 11),
            expiresAt: addMonths(now, 12),
            reviewedById: actor.id,
            reviewedAt: now,
            notes: note ?? item.notes
          }
        : action === "REVIEWED"
          ? {
              status: DocumentExpiryStatus.ACTIVE,
              reviewedById: actor.id,
              reviewedAt: now,
              notes: note ?? item.notes
            }
          : action === "MARK_EXPIRED"
            ? {
                status: DocumentExpiryStatus.EXPIRED,
                reviewedById: actor.id,
                reviewedAt: now,
                notes: note ?? item.notes
              }
            : {
                status: DocumentExpiryStatus.ARCHIVED,
                reviewedById: actor.id,
                reviewedAt: now,
                notes: note ?? item.notes
              };

    const result = await prisma.documentExpiryItem.update({
      where: { id: itemId },
      data
    });
    await logActivity({
      userId: actor.id,
      workspaceId: item.workspaceId ?? undefined,
      action: activityActions.documentExpiryUpdated,
      targetId: item.id,
      metadata: { workflowAction: action, status: result.status }
    });

    return ok({ result });
  } catch (error) {
    return handleRouteError(error);
  }
}
