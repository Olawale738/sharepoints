import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership, requireWorkspacePermission } from "@/lib/rbac";
import { createChannelSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspaceMembership(user.id, id);

    const channels = await prisma.chatChannel.findMany({
      where: { workspaceId: id },
      include: {
        _count: {
          select: { messages: true }
        },
        messages: {
          take: 1,
          orderBy: { createdAt: "desc" },
          include: {
            author: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true
              }
            }
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });

    return ok({ channels });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspacePermission(user.id, id, "canCreateChannels");

    const body = await request.json();
    const parsed = createChannelSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid channel details.");
    }

    const channel = await prisma.chatChannel.create({
      data: {
        workspaceId: id,
        createdById: user.id,
        name: parsed.data.name,
        description: parsed.data.description || null
      }
    });

    await logActivity({
      userId: user.id,
      workspaceId: id,
      action: activityActions.channelCreated,
      targetId: channel.id,
      metadata: { name: channel.name }
    });

    return ok({ channel }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
