import { ApiError, handleRouteError, ok } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { getOrCreateGeneralChannel } from "@/lib/chat";
import { prisma } from "@/lib/prisma";
import { incomingWebhookSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ secret: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const { secret } = await context.params;
    const integration = await prisma.integration.findUnique({
      where: { webhookSecret: secret },
      include: {
        channel: {
          select: {
            id: true
          }
        }
      }
    });

    if (!integration?.enabled) {
      throw new ApiError(404, "Webhook integration not found.");
    }

    const body = await request.json();
    const parsed = incomingWebhookSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid webhook payload.");
    }

    const channel = integration.channel ?? (await getOrCreateGeneralChannel(integration.workspaceId, integration.createdById));
    const message = await prisma.chatMessage.create({
      data: {
        channelId: channel.id,
        externalAuthor: parsed.data.username ?? integration.name,
        body: parsed.data.text
      }
    });

    await logActivity({
      workspaceId: integration.workspaceId,
      action: activityActions.webhookReceived,
      targetId: message.id,
      metadata: {
        integrationId: integration.id,
        channelId: channel.id
      }
    });

    return ok({ delivered: true, messageId: message.id });
  } catch (error) {
    return handleRouteError(error);
  }
}

