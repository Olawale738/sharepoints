import { NotificationDeliveryChannel, NotificationDeliveryStatus, NotificationPriority, WorkspaceRole } from "@prisma/client";
import { z } from "zod";

import { logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { deliverPendingNotifications } from "@/lib/notification-delivery";
import { recordNotificationDeliveryEvent } from "@/lib/notification-delivery-events";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";
import { getWhatsAppConfig, normalizeWhatsAppPhone, sendWhatsAppMessage } from "@/lib/whatsapp";

export const runtime = "nodejs";

const broadcastSchema = z.object({
  audienceType: z.enum(["ALL", "LEADERSHIP", "UNIT", "WORKSPACE", "ROLE", "USER"]),
  unitId: z.string().cuid().optional().nullable(),
  workspaceId: z.string().cuid().optional().nullable(),
  role: z.nativeEnum(WorkspaceRole).optional().nullable(),
  userId: z.string().cuid().optional().nullable(),
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(1).max(4000),
  href: z.string().trim().max(300).optional().nullable(),
  priority: z.nativeEnum(NotificationPriority).optional().default(NotificationPriority.NORMAL),
  emergency: z.boolean().optional().default(false),
  whatsappMode: z.enum(["TEXT", "TEMPLATE"]).optional().default("TEXT"),
  whatsappTemplateName: z.string().trim().max(120).optional().nullable(),
  whatsappTemplateLanguage: z.string().trim().min(2).max(12).optional().nullable(),
  channels: z
    .object({
      inApp: z.boolean().optional().default(true),
      email: z.boolean().optional().default(false),
      whatsapp: z.boolean().optional().default(false)
    })
    .optional()
    .default({})
});

type Recipient = {
  id: string;
  email: string | null;
  memberProfile: { phone: string | null; alternatePhone: string | null } | null;
};

async function getRecipients(data: z.infer<typeof broadcastSchema>) {
  const activeWhere = {
    deletedAt: null,
    suspendedAt: null,
    accessRevokedAt: null,
    email: { endsWith: "@letw.org" }
  };
  const userSelect = {
    id: true,
    email: true,
    memberProfile: { select: { phone: true, alternatePhone: true } }
  };

  if (data.audienceType === "ALL") {
    return prisma.user.findMany({
      where: activeWhere,
      select: userSelect,
      take: 5000
    });
  }

  if (data.audienceType === "LEADERSHIP") {
    const [workspaceLeaders, unitLeaderRows] = await Promise.all([
      prisma.workspaceMember.findMany({
        where: {
          role: { in: [WorkspaceRole.ADMIN, WorkspaceRole.LEADER, WorkspaceRole.MODERATOR] },
          ...(data.workspaceId ? { workspaceId: data.workspaceId } : {}),
          user: activeWhere,
          workspace: { deletedAt: null }
        },
        select: { user: { select: userSelect } },
        take: 5000
      }),
      prisma.organizationUnitLeader.findMany({
        where: {
          ...(data.unitId ? { unitId: data.unitId } : {})
        },
        select: { userId: true },
        take: 5000
      })
    ]);
    const unitLeaderIds = [...new Set(unitLeaderRows.map((leader) => leader.userId))];
    const unitLeaders = unitLeaderIds.length
      ? await prisma.user.findMany({
          where: { ...activeWhere, id: { in: unitLeaderIds } },
          select: userSelect,
          take: 5000
        })
      : [];

    return [...workspaceLeaders.map((member) => member.user), ...unitLeaders];
  }

  if (data.audienceType === "UNIT") {
    if (!data.unitId) throw new ApiError(422, "Choose an organization unit.");
    return prisma.user.findMany({
      where: {
        ...activeWhere,
        memberProfile: { is: { currentOrganizationUnitId: data.unitId } }
      },
      select: userSelect,
      take: 5000
    });
  }

  if (data.audienceType === "WORKSPACE") {
    if (!data.workspaceId) throw new ApiError(422, "Choose a workspace.");
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: data.workspaceId, user: activeWhere },
      select: { user: { select: userSelect } },
      take: 5000
    });
    return members.map((member) => member.user);
  }

  if (data.audienceType === "ROLE") {
    if (!data.role) throw new ApiError(422, "Choose a role.");
    const members = await prisma.workspaceMember.findMany({
      where: {
        role: data.role,
        ...(data.workspaceId ? { workspaceId: data.workspaceId } : {}),
        user: activeWhere
      },
      select: { user: { select: userSelect } },
      take: 5000
    });
    return members.map((member) => member.user);
  }

  if (!data.userId) throw new ApiError(422, "Choose a member.");
  return prisma.user.findMany({
    where: { ...activeWhere, id: data.userId },
    select: userSelect,
    take: 1
  });
}

export async function GET() {
  try {
    const actor = await requireUser();
    if (!(await hasAnyWorkspaceAdminRole(actor.id))) {
      throw new ApiError(403, "Only administrators can view WhatsApp configuration.");
    }
    const config = getWhatsAppConfig();

    return ok({
      whatsApp: {
        configured: config.configured,
        graphVersion: config.graphVersion,
        defaultCountryCodeConfigured: config.defaultCountryCodeConfigured,
        templateConfigured: Boolean(config.fallbackTemplateName),
        fallbackTemplateLanguage: config.fallbackTemplateLanguage,
        templateHasBodyParams: config.templateHasBodyParams,
        setupRequired: config.configured
          ? []
          : ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"]
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    if (!(await hasAnyWorkspaceAdminRole(actor.id))) {
      throw new ApiError(403, "Only administrators can send organization broadcasts.");
    }

    const parsed = broadcastSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid broadcast.");
    }

    const data = parsed.data;
    if (data.channels.whatsapp && data.whatsappMode === "TEMPLATE" && !(data.whatsappTemplateName || process.env.WHATSAPP_TEMPLATE_NAME)) {
      throw new ApiError(422, "Choose a WhatsApp template name or set WHATSAPP_TEMPLATE_NAME.");
    }

    const recipients = await getRecipients(data);
    const uniqueRecipients = Array.from(new Map(recipients.map((recipient) => [recipient.id, recipient])).values());
    if (!uniqueRecipients.length) {
      throw new ApiError(404, "No active LETW members matched this audience.");
    }

    const priority = data.emergency ? NotificationPriority.URGENT : data.priority;
    const notificationType = data.emergency ? "EMERGENCY_BROADCAST" : "ADMIN_BROADCAST";
    const title = data.emergency && !data.title.toLowerCase().includes("emergency")
      ? `Emergency: ${data.title}`
      : data.title;
    const notifications = await notifyUsers(
      uniqueRecipients.map((recipient) => recipient.id),
      {
        workspaceId: data.workspaceId ?? null,
        type: notificationType,
        title,
        body: data.body,
        href: data.href || "/dashboard",
        priority
      }
    );
    const notificationIds = notifications?.map((notification) => notification.id) ?? [];
    const notificationByUserId = new Map((notifications ?? []).map((notification) => [notification.userId, notification.id]));
    const delivery = data.channels.email
      ? await deliverPendingNotifications(notificationIds.slice(0, 500))
      : { delivered: 0, scanned: notificationIds.length };

    let whatsAppSent = 0;
    let whatsAppFailed = 0;
    let whatsAppSkipped = 0;
    const whatsAppErrors: string[] = [];
    if (data.channels.whatsapp) {
      for (const recipient of uniqueRecipients.slice(0, 250)) {
        const phone = normalizeWhatsAppPhone(recipient.memberProfile?.phone ?? recipient.memberProfile?.alternatePhone);
        if (!phone) {
          whatsAppSkipped += 1;
          await recordNotificationDeliveryEvent({
            notificationId: notificationByUserId.get(recipient.id),
            userId: recipient.id,
            channel: NotificationDeliveryChannel.WHATSAPP,
            status: NotificationDeliveryStatus.SKIPPED,
            provider: "WHATSAPP_CLOUD",
            blockedReason: "No valid WhatsApp phone number is saved for this member."
          });
          continue;
        }
        const result = await sendWhatsAppMessage({
          phone,
          title,
          body: data.body,
          href: data.href,
          mode: data.whatsappMode,
          templateName: data.whatsappTemplateName,
          templateLanguage: data.whatsappTemplateLanguage
        });
        await recordNotificationDeliveryEvent({
          notificationId: notificationByUserId.get(recipient.id),
          userId: recipient.id,
          channel: NotificationDeliveryChannel.WHATSAPP,
          status: result.sent
            ? NotificationDeliveryStatus.DELIVERED
            : result.skipped
              ? NotificationDeliveryStatus.SKIPPED
              : NotificationDeliveryStatus.FAILED,
          provider: "WHATSAPP_CLOUD",
          providerMessageId: result.messageId,
          error: result.error,
          attemptedAt: new Date(),
          deliveredAt: result.sent ? new Date() : null
        });
        if (result.skipped) whatsAppSkipped += 1;
        else if (result.sent) whatsAppSent += 1;
        else {
          whatsAppFailed += 1;
          if (result.error && whatsAppErrors.length < 5) {
            whatsAppErrors.push(result.error);
          }
        }
      }
    }

    await logActivity({
      userId: actor.id,
      action: "notification.broadcast_sent",
      targetId: data.workspaceId ?? data.unitId ?? data.userId ?? undefined,
      metadata: {
        audienceType: data.audienceType,
        emergency: data.emergency,
        recipientCount: uniqueRecipients.length,
        channels: data.channels,
        emailDelivery: delivery,
        whatsAppMode: data.whatsappMode,
        whatsAppSent,
        whatsAppFailed,
        whatsAppSkipped,
        whatsAppErrors
      }
    });
    const whatsAppConfig = getWhatsAppConfig();

    return ok({
      sent: uniqueRecipients.length,
      notificationCount: notificationIds.length,
      emailDelivery: delivery,
      whatsApp: {
        configured: whatsAppConfig.configured,
        mode: data.whatsappMode,
        attempted: data.channels.whatsapp ? Math.min(uniqueRecipients.length, 250) : 0,
        sent: whatsAppSent,
        failed: whatsAppFailed,
        skipped: whatsAppSkipped,
        errors: whatsAppErrors,
        note:
          data.channels.whatsapp && data.whatsappMode === "TEXT"
            ? "Free-form WhatsApp text may fail outside the 24-hour service window. Use an approved template for organization-initiated broadcasts."
            : null
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
