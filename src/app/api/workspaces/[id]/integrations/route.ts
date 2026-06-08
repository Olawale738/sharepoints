import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { getOrCreateGeneralChannel } from "@/lib/chat";
import { prisma } from "@/lib/prisma";
import { requireWorkspacePermission } from "@/lib/rbac";
import { createIntegrationSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function getWebhookUrl(request: Request, secret: string) {
  return `${new URL(request.url).origin}/api/integrations/webhooks/${secret}`;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspacePermission(user.id, id, "canManageIntegrations");

    const integrations = await prisma.integration.findMany({
      where: { workspaceId: id },
      include: {
        channel: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return ok({
      integrations: integrations.map((integration) => ({
        ...integration,
        webhookUrl: getWebhookUrl(request, integration.webhookSecret)
      }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspacePermission(user.id, id, "canManageIntegrations");

    const body = await request.json();
    const parsed = createIntegrationSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid integration details.");
    }

    let channelId = parsed.data.channelId || null;

    if (channelId) {
      const channel = await prisma.chatChannel.findFirst({
        where: {
          id: channelId,
          workspaceId: id
        },
        select: { id: true }
      });

      if (!channel) {
        throw new ApiError(404, "Channel not found.");
      }
    } else {
      const general = await getOrCreateGeneralChannel(id, user.id);
      channelId = general.id;
    }

    const integration = await prisma.integration.create({
      data: {
        workspaceId: id,
        channelId,
        createdById: user.id,
        name: parsed.data.name,
        targetUrl: parsed.data.targetUrl || null
      },
      include: {
        channel: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    await logActivity({
      userId: user.id,
      workspaceId: id,
      action: activityActions.integrationCreated,
      targetId: integration.id,
      metadata: { name: integration.name, channelId }
    });

    return ok(
      {
        integration: {
          ...integration,
          webhookUrl: getWebhookUrl(request, integration.webhookSecret)
        }
      },
      { status: 201 }
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
