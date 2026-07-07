import { NotificationPriority, WorkspaceRole } from "@prisma/client";
import { z } from "zod";

import { logActivity } from "@/lib/activity";
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

type WhatsAppDeliveryResult = {
  sent: boolean;
  skipped: boolean;
  phone?: string;
  messageId?: string;
  error?: string;
  statusCode?: number;
};

function normalizePhone(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const countryCode = (process.env.WHATSAPP_DEFAULT_COUNTRY_CODE ?? "").replace(/\D/g, "");
  let digits = trimmed.replace(/[^\d+]/g, "");

  if (digits.startsWith("+")) {
    digits = digits.slice(1);
  } else {
    digits = digits.replace(/\D/g, "");
    if (digits.startsWith("00")) {
      digits = digits.slice(2);
    } else if (digits.startsWith("0") && countryCode) {
      digits = `${countryCode}${digits.slice(1)}`;
    }
  }
  if (!/^\d{8,15}$/.test(digits)) return null;
  return digits;
}

function getWhatsAppConfig() {
  return {
    configured: Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID),
    token: process.env.WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    graphVersion: process.env.WHATSAPP_GRAPH_VERSION ?? "v20.0",
    defaultCountryCodeConfigured: Boolean(process.env.WHATSAPP_DEFAULT_COUNTRY_CODE),
    fallbackTemplateName: process.env.WHATSAPP_TEMPLATE_NAME,
    fallbackTemplateLanguage: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? "en",
    templateHasBodyParams: process.env.WHATSAPP_TEMPLATE_HAS_BODY_PARAMS !== "false"
  };
}

function getWhatsAppError(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const error = (payload as { error?: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string } }).error;
  if (!error) return null;
  return [
    error.message,
    error.code ? `code ${error.code}` : null,
    error.error_subcode ? `subcode ${error.error_subcode}` : null,
    error.fbtrace_id ? `trace ${error.fbtrace_id}` : null
  ]
    .filter(Boolean)
    .join(" - ");
}

function getWhatsAppMessageId(payload: unknown) {
  if (!payload || typeof payload !== "object") return undefined;
  const messages = (payload as { messages?: Array<{ id?: string }> }).messages;
  return messages?.[0]?.id;
}

function buildWhatsAppTextBody(title: string, body: string, href?: string | null) {
  const origin = (process.env.AUTH_URL ?? "https://sharepoints.letw.org").replace(/\/$/, "");
  const link = href ? `${origin}${href.startsWith("/") ? href : `/${href}`}` : null;
  return [title, "", body, link ? `Open in LETW: ${link}` : null].filter(Boolean).join("\n").slice(0, 3900);
}

async function sendWhatsAppMessage(input: {
  phone: string;
  title: string;
  body: string;
  href?: string | null;
  mode: "TEXT" | "TEMPLATE";
  templateName?: string | null;
  templateLanguage?: string | null;
}): Promise<WhatsAppDeliveryResult> {
  const config = getWhatsAppConfig();

  if (!config.configured || !config.token || !config.phoneNumberId) {
    return { sent: false, skipped: true, phone: input.phone, error: "WhatsApp provider is not configured." };
  }

  const templateName = input.templateName || config.fallbackTemplateName;
  const templateLanguage = input.templateLanguage || config.fallbackTemplateLanguage;
  if (input.mode === "TEMPLATE" && !templateName) {
    return {
      sent: false,
      skipped: true,
      phone: input.phone,
      error: "WhatsApp template mode selected, but no template name was provided."
    };
  }

  const payload =
    input.mode === "TEMPLATE"
      ? {
          messaging_product: "whatsapp",
          to: input.phone,
          type: "template",
          template: {
            name: templateName,
            language: { code: templateLanguage },
            ...(config.templateHasBodyParams
              ? {
                  components: [
                    {
                      type: "body",
                      parameters: [
                        { type: "text", text: input.title.slice(0, 512) },
                        { type: "text", text: input.body.slice(0, 1024) }
                      ]
                    }
                  ]
                }
              : {})
          }
        }
      : {
          messaging_product: "whatsapp",
          to: input.phone,
          type: "text",
          text: {
            preview_url: true,
            body: buildWhatsAppTextBody(input.title, input.body, input.href)
          }
        };

  const response = await fetch(`https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const body = (await response.json().catch(() => null)) as unknown;

  return {
    sent: response.ok,
    skipped: false,
    phone: input.phone,
    statusCode: response.status,
    messageId: response.ok ? getWhatsAppMessageId(body) : undefined,
    error: response.ok ? undefined : getWhatsAppError(body) ?? `WhatsApp request failed with HTTP ${response.status}.`
  };
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
    const whatsAppErrors: string[] = [];
    if (data.channels.whatsapp) {
      for (const recipient of uniqueRecipients.slice(0, 250)) {
        const phone = normalizePhone(recipient.memberProfile?.phone ?? recipient.memberProfile?.alternatePhone);
        if (!phone) {
          whatsAppSkipped += 1;
          continue;
        }
        const result = await sendWhatsAppMessage({
          phone,
          title: data.title,
          body: data.body,
          href: data.href,
          mode: data.whatsappMode,
          templateName: data.whatsappTemplateName,
          templateLanguage: data.whatsappTemplateLanguage
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
