import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { requireOrgChatRoomAccess, requireOrgChatRoomSendAccess } from "@/lib/org-chat";
import { prisma } from "@/lib/prisma";
import { createDirectMessageSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ roomId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { roomId } = await context.params;
    await requireOrgChatRoomAccess(user.id, roomId);

    const { searchParams } = new URL(request.url);
    const take = Math.min(Number(searchParams.get("take") ?? 50), 100);
    const messages = await prisma.orgChatMessage.findMany({
      where: {
        roomId
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take
    });

    return ok({ messages: messages.reverse() });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { roomId } = await context.params;
    const room = await requireOrgChatRoomSendAccess(user.id, roomId);
    const body = await request.json();
    const parsed = createDirectMessageSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid message.");
    }

    const message = await prisma.orgChatMessage.create({
      data: {
        roomId,
        authorId: user.id,
        body: parsed.data.body
      },
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
    });

    await logActivity({
      userId: user.id,
      action: activityActions.orgChatMessageCreated,
      targetId: message.id,
      metadata: {
        roomId,
        audience: room.audience
      }
    });

    return ok({ message }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
