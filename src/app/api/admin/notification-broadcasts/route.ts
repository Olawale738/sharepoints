import { NotificationPriority, WorkspaceRole } from "@prisma/client";
import { z } from "zod";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { deliverPendingNotifications } from "@/lib/notification-delivery";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export const runtime = "nodejs";

const broadcastSchema = z.object({
  audienceType: z.enum(["ALL", "UNIT", "WORKSPACE", "ROLE", "USER"]),
  unitId: z.string().cuid().optional().nullable(),
  workspaceId: z.string().cuid().optional().nullable(),
  role: z.nativeEnum(WorkspaceRole).optional().nullable(),
  userId: z.string().cuid().optional().nullable(),
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(1).max(4000),
  href: z.string().trim().max(300).optional().nullable(),
  priority: z.nativeEnum(NotificationPriority).optional().default(NotificationPriority.NORMAL),
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

function normalizePhone(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const countryCode = (process.env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? "").replace(/\D/g, "");
  let digits = trimmed.replace(/[^\d+]/g, "");

  if (digits.startsWith("+")) {
    return digits.slice(1);
  }

  digits = digits.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("0") && countryCode) {
    return `${countryCode}${digits.slice(1)}`;
  }
  return digits;
}

async function sendWhatsAppMessage(phone: string, body: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION ?? "v20.0";

  if (!token || !phoneNumberId) {
    return { sent: false, skipped: true };
  }

  const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: phone,
      type: "text",
      text: {
        preview_url: false,
        body: body.slice(0, 3900)
      }
    })
  });

  return { sent: response.ok, skipped: false };
}

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
    const recipients = await getRecipients(data);
    const uniqueRecipients = Array.from(new Map(recipients.map((recipient) => [recipient.id, recipient])).values());
    if (!uniqueRecipients.length) {
      throw new ApiError(404, "No active LETW members matched this audience.");
    }

    const notifications = await notifyUsers(
      uniqueRecipients.map((recipient) => recipient.id),
      {
        workspaceId: data.workspaceId ?? null,
        type: "ADMIN_BROADCAST",
        title: data.title,
        body: data.body,
        href: data.href || "/dashboard",
        priority: data.priority
      }
    );
    const notificationIds = notifications?.map((notification) => notification.id) ?? [];
    const delivery = data.channels.email
      ? await deliverPendingNotifications(notificationIds.slice(0, 500))
      : { delivered: 0, scanned: notificationIds.length };

    let whatsAppSent = 0;
    let whatsAppFailed = 0;
    let whatsAppSkipped = 0;
    if (data.channels.whatsapp) {
      for (const recipient of uniqueRecipients.slice(0, 250)) {
        const phone = normalizePhone(recipient.memberProfile?.phone ?? recipient.memberProfile?.alternatePhone);
        if (!phone) {
          whatsAppSkipped += 1;
          continue;
        }
        const result = await sendWhatsAppMessage(phone, `${data.title}\n\n${data.body}`);
        if (result.skipped) whatsAppSkipped += 1;
        else if (result.sent) whatsAppSent += 1;
        else whatsAppFailed += 1;
      }
    }

    await logActivity({
      userId: actor.id,
      action: "notification.broadcast_sent",
      targetId: data.workspaceId ?? data.unitId ?? data.userId ?? undefined,
      metadata: {
        audienceType: data.audienceType,
        recipientCount: uniqueRecipients.length,
        channels: data.channels,
        emailDelivery: delivery,
        whatsAppSent,
        whatsAppFailed,
        whatsAppSkipped
      }
    });

    return ok({
      sent: uniqueRecipients.length,
      notificationCount: notificationIds.length,
      emailDelivery: delivery,
      whatsApp: {
        configured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
        sent: whatsAppSent,
        failed: whatsAppFailed,
        skipped: whatsAppSkipped
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
