import { WhatsAppMessageDirection, WhatsAppMessageStatus } from "@prisma/client";
import { z } from "zod";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";
import { getWhatsAppConfig, sendWhatsAppMessage } from "@/lib/whatsapp";

export const runtime = "nodejs";

const replySchema = z.object({
  conversationId: z.string().cuid(),
  body: z.string().trim().min(1).max(3000)
});

async function requireAdmin() {
  const actor = await requireUser();
  if (!(await hasAnyWorkspaceAdminRole(actor.id))) {
    throw new ApiError(403, "Only administrators can use the WhatsApp inbox.");
  }
  return actor;
}

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const selectedConversationId = url.searchParams.get("conversationId");
    const conversations = await prisma.whatsAppConversation.findMany({
      orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
      take: 80
    });
    const conversationId = selectedConversationId ?? conversations[0]?.id ?? null;
    const messages = conversationId
      ? await prisma.whatsAppMessage.findMany({
          where: { conversationId },
          orderBy: { createdAt: "asc" },
          take: 150
        })
      : [];
    const userIds = Array.from(new Set(conversations.map((conversation) => conversation.userId).filter((id): id is string => Boolean(id))));
    const workspaceIds = Array.from(new Set(conversations.map((conversation) => conversation.workspaceId).filter((id): id is string => Boolean(id))));
    const [users, workspaces] = await Promise.all([
      userIds.length
        ? prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, email: true, image: true }
          })
        : [],
      workspaceIds.length
        ? prisma.workspace.findMany({
            where: { id: { in: workspaceIds } },
            select: { id: true, name: true }
          })
        : []
    ]);
    const userById = new Map(users.map((user) => [user.id, user]));
    const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
    const config = getWhatsAppConfig();

    return ok({
      whatsApp: {
        configured: config.configured,
        graphVersion: config.graphVersion,
        webhookConfigured: Boolean(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN),
        signatureVerification: Boolean(process.env.WHATSAPP_APP_SECRET)
      },
      selectedConversationId: conversationId,
      conversations: conversations.map((conversation) => ({
        ...conversation,
        user: conversation.userId ? userById.get(conversation.userId) ?? null : null,
        workspace: conversation.workspaceId ? workspaceById.get(conversation.workspaceId) ?? null : null
      })),
      messages
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin();
    const parsed = replySchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid WhatsApp reply.");
    }
    const conversation = await prisma.whatsAppConversation.findUnique({
      where: { id: parsed.data.conversationId }
    });
    if (!conversation) {
      throw new ApiError(404, "WhatsApp conversation not found.");
    }
    const result = await sendWhatsAppMessage({
      phone: conversation.phone,
      title: "LETW",
      body: parsed.data.body,
      mode: "TEXT"
    });
    if (result.skipped) {
      throw new ApiError(503, result.error ?? "WhatsApp provider is not configured.");
    }
    if (!result.sent) {
      throw new ApiError(result.statusCode && result.statusCode >= 500 ? 502 : 400, result.error ?? "WhatsApp reply failed.");
    }

    const message = await prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        userId: conversation.userId,
        workspaceId: conversation.workspaceId,
        direction: WhatsAppMessageDirection.OUTBOUND,
        status: WhatsAppMessageStatus.SENT,
        providerId: result.messageId,
        toPhone: conversation.phone,
        messageType: "text",
        body: parsed.data.body,
        sentById: actor.id
      }
    });
    await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: message.createdAt }
    });
    await logActivity({
      userId: actor.id,
      workspaceId: conversation.workspaceId ?? undefined,
      action: activityActions.whatsAppMessageSent,
      targetId: conversation.id,
      metadata: {
        providerId: result.messageId,
        phone: conversation.phone
      }
    });

    return ok({ message });
  } catch (error) {
    return handleRouteError(error);
  }
}
