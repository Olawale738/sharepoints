import { WhatsAppMessageDirection, WhatsAppMessageStatus, type Prisma } from "@prisma/client";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok } from "@/lib/api";
import { createWhatsAppAdminCommand } from "@/lib/executive-command-center";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { normalizeWhatsAppPhone, verifyWhatsAppWebhookSignature } from "@/lib/whatsapp";

export const runtime = "nodejs";

type WhatsAppWebhookMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: {
    button_reply?: { title?: string };
    list_reply?: { title?: string };
  };
  image?: { id?: string; mime_type?: string; sha256?: string; caption?: string };
  video?: { id?: string; mime_type?: string; sha256?: string; caption?: string };
  audio?: { id?: string; mime_type?: string; sha256?: string };
  document?: { id?: string; mime_type?: string; sha256?: string; filename?: string; caption?: string };
};

type WhatsAppWebhookStatus = {
  id?: string;
  status?: string;
};

type WhatsAppWebhookValue = {
  contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
  messages?: WhatsAppWebhookMessage[];
  statuses?: WhatsAppWebhookStatus[];
  metadata?: { phone_number_id?: string; display_phone_number?: string };
};

type WhatsAppWebhookPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: WhatsAppWebhookValue;
    }>;
  }>;
};

function messageReceivedAt(message: WhatsAppWebhookMessage) {
  const timestamp = Number(message.timestamp);
  if (Number.isFinite(timestamp) && timestamp > 0) {
    return new Date(timestamp * 1000);
  }
  return new Date();
}

function inboundMessageBody(message: WhatsAppWebhookMessage) {
  if (message.text?.body) return message.text.body;
  if (message.button?.text) return message.button.text;
  if (message.interactive?.button_reply?.title) return message.interactive.button_reply.title;
  if (message.interactive?.list_reply?.title) return message.interactive.list_reply.title;
  if (message.image?.caption) return message.image.caption;
  if (message.video?.caption) return message.video.caption;
  if (message.document?.caption) return message.document.caption;
  if (message.document?.filename) return `Document: ${message.document.filename}`;
  return `[${message.type ?? "whatsapp"} message]`;
}

function looksLikeAdminCommand(body: string) {
  const value = body.trim().toLowerCase();
  return (
    value.startsWith("admin ") ||
    value.startsWith("/admin") ||
    value.includes("show pending reports") ||
    (value.includes("remind") && value.includes("leader")) ||
    value.includes("create sunday service plan") ||
    value.includes("sunday service plan")
  );
}

function inboundMedia(message: WhatsAppWebhookMessage) {
  const media = message.image ?? message.video ?? message.audio ?? message.document;
  return {
    mediaId: media?.id,
    mediaMimeType: media?.mime_type,
    mediaSha256: media?.sha256
  };
}

function mapStatus(value?: string) {
  if (value === "sent") return WhatsAppMessageStatus.SENT;
  if (value === "delivered") return WhatsAppMessageStatus.DELIVERED;
  if (value === "read") return WhatsAppMessageStatus.READ;
  if (value === "failed") return WhatsAppMessageStatus.FAILED;
  return null;
}

async function findUserByPhone(phone: string) {
  const suffix = phone.slice(-10);
  const candidates = await prisma.user.findMany({
    where: {
      deletedAt: null,
      suspendedAt: null,
      accessRevokedAt: null,
      memberProfile: {
        is: {
          OR: [
            { phone: { contains: suffix } },
            { alternatePhone: { contains: suffix } }
          ]
        }
      }
    },
    select: {
      id: true,
      name: true,
      email: true,
      memberProfile: {
        select: {
          phone: true,
          alternatePhone: true
        }
      }
    },
    take: 25
  });

  return (
    candidates.find((candidate) => {
      const primary = normalizeWhatsAppPhone(candidate.memberProfile?.phone);
      const alternate = normalizeWhatsAppPhone(candidate.memberProfile?.alternatePhone);
      return primary === phone || alternate === phone;
    }) ?? null
  );
}

async function findDefaultWorkspace(userId: string) {
  const membership = await prisma.workspaceMember.findFirst({
    where: {
      userId,
      workspace: { deletedAt: null }
    },
    orderBy: { joinedAt: "asc" },
    select: { workspaceId: true }
  });
  return membership?.workspaceId ?? null;
}

async function notifyAdmins(message: WhatsAppWebhookMessage, displayName: string | null) {
  const adminMemberships = await prisma.workspaceMember.findMany({
    where: {
      role: "ADMIN",
      workspace: { deletedAt: null },
      user: {
        deletedAt: null,
        suspendedAt: null,
        accessRevokedAt: null
      }
    },
    select: { userId: true },
    distinct: ["userId"],
    take: 100
  });
  const adminIds = adminMemberships.map((membership) => membership.userId);
  if (!adminIds.length) return;

  await notifyUsers(adminIds, {
    type: "WHATSAPP_INBOUND",
    title: "New WhatsApp message",
    body: `${displayName ?? "Unknown contact"}: ${inboundMessageBody(message).slice(0, 180)}`,
    href: "/dashboard/admin/whatsapp-inbox"
  });
}

async function handleInboundMessage(value: WhatsAppWebhookValue, message: WhatsAppWebhookMessage) {
  const phone = normalizeWhatsAppPhone(message.from);
  if (!phone) return false;

  const existing = message.id
    ? await prisma.whatsAppMessage.findUnique({
        where: { providerId: message.id },
        select: { id: true }
      })
    : null;
  if (existing) return false;

  const contact = value.contacts?.find((item) => normalizeWhatsAppPhone(item.wa_id) === phone);
  const user = await findUserByPhone(phone);
  const workspaceId = user ? await findDefaultWorkspace(user.id) : null;
  const displayName = contact?.profile?.name ?? user?.name ?? user?.email ?? null;
  const receivedAt = messageReceivedAt(message);
  const updateData: Prisma.WhatsAppConversationUpdateInput = {
    displayName,
    lastMessageAt: receivedAt
  };
  if (user?.id) updateData.userId = user.id;
  if (workspaceId) updateData.workspaceId = workspaceId;
  const conversation = await prisma.whatsAppConversation.upsert({
    where: { phone },
    create: {
      phone,
      userId: user?.id ?? null,
      workspaceId,
      displayName,
      lastMessageAt: receivedAt
    },
    update: updateData
  });
  const media = inboundMedia(message);

  const body = inboundMessageBody(message);
  const savedMessage = await prisma.whatsAppMessage.create({
    data: {
      conversationId: conversation.id,
      userId: user?.id ?? null,
      workspaceId,
      direction: WhatsAppMessageDirection.INBOUND,
      status: WhatsAppMessageStatus.RECEIVED,
      providerId: message.id,
      fromPhone: phone,
      toPhone: normalizeWhatsAppPhone(value.metadata?.display_phone_number),
      messageType: message.type ?? "unknown",
      body,
      mediaId: media.mediaId,
      mediaMimeType: media.mediaMimeType,
      mediaSha256: media.mediaSha256,
      rawPayload: JSON.parse(JSON.stringify(message)) as Prisma.InputJsonValue,
      receivedAt
    }
  });

  if (user?.id && looksLikeAdminCommand(body)) {
    await createWhatsAppAdminCommand(user.id, body.replace(/^\/?admin\s*:?/i, "").trim() || body, {
      conversationId: conversation.id,
      messageId: savedMessage.id
    }).catch(() => null);
  }

  await logActivity({
    userId: user?.id,
    workspaceId: workspaceId ?? undefined,
    action: activityActions.whatsAppMessageReceived,
    targetId: conversation.id,
    metadata: {
      providerId: message.id,
      phone,
      messageType: message.type ?? "unknown"
    }
  });
  await notifyAdmins(message, displayName);
  return true;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    if (!expected) {
      throw new ApiError(503, "WHATSAPP_WEBHOOK_VERIFY_TOKEN is not configured.");
    }
    if (mode === "subscribe" && token === expected && challenge) {
      return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
    }
    throw new ApiError(403, "WhatsApp webhook verification failed.");
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    if (!verifyWhatsAppWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"))) {
      throw new ApiError(401, "Invalid WhatsApp webhook signature.");
    }
    const payload = JSON.parse(rawBody) as WhatsAppWebhookPayload;
    let messagesSaved = 0;
    let statusesUpdated = 0;

    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) continue;

        for (const status of value.statuses ?? []) {
          const mapped = mapStatus(status.status);
          if (!mapped || !status.id) continue;
          const result = await prisma.whatsAppMessage.updateMany({
            where: { providerId: status.id },
            data: { status: mapped }
          });
          statusesUpdated += result.count;
        }

        for (const message of value.messages ?? []) {
          const saved = await handleInboundMessage(value, message);
          if (saved) messagesSaved += 1;
        }
      }
    }

    return ok({ received: true, messagesSaved, statusesUpdated });
  } catch (error) {
    return handleRouteError(error);
  }
}
