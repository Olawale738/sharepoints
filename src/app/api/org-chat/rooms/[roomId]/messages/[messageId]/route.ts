import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import {
  ensureMessageAuthor,
  ensureMessageCanStillBeDeleted,
  ensureMessageIsNotDeleted
} from "@/lib/message-policy";
import { requireOrgChatRoomAccess, requireOrgChatRoomSendAccess } from "@/lib/org-chat";
import { prisma } from "@/lib/prisma";
import { updateMessageSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ roomId: string; messageId: string }>;
};

const messageInclude = {
  author: {
    select: {
      id: true,
      name: true,
      email: true,
      image: true
    }
  }
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { roomId, messageId } = await context.params;
    const room = await requireOrgChatRoomSendAccess(user.id, roomId);
    const body = await request.json();
    const parsed = updateMessageSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid organization message.");
    }

    const existing = await prisma.orgChatMessage.findFirst({
      where: {
        id: messageId,
        roomId
      },
      select: {
        id: true,
        authorId: true,
        deletedAt: true
      }
    });

    if (!existing) {
      throw new ApiError(404, "Organization message not found.");
    }

    ensureMessageAuthor(existing.authorId, user.id);
    ensureMessageIsNotDeleted(existing.deletedAt);

    const message = await prisma.orgChatMessage.update({
      where: {
        id: messageId
      },
      data: {
        body: parsed.data.body,
        editedAt: new Date()
      },
      include: messageInclude
    });

    await logActivity({
      userId: user.id,
      action: activityActions.orgChatMessageEdited,
      targetId: message.id,
      metadata: {
        roomId,
        audience: room.audience
      }
    });

    return ok({ message });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { roomId, messageId } = await context.params;
    const room = await requireOrgChatRoomAccess(user.id, roomId);
    const existing = await prisma.orgChatMessage.findFirst({
      where: {
        id: messageId,
        roomId
      },
      select: {
        id: true,
        authorId: true,
        createdAt: true,
        deletedAt: true
      }
    });

    if (!existing) {
      throw new ApiError(404, "Organization message not found.");
    }

    ensureMessageAuthor(existing.authorId, user.id);
    ensureMessageIsNotDeleted(existing.deletedAt);
    ensureMessageCanStillBeDeleted(existing.createdAt);

    const message = await prisma.orgChatMessage.update({
      where: {
        id: messageId
      },
      data: {
        body: "",
        deletedAt: new Date()
      },
      include: messageInclude
    });

    await logActivity({
      userId: user.id,
      action: activityActions.orgChatMessageDeleted,
      targetId: message.id,
      metadata: {
        roomId,
        audience: room.audience
      }
    });

    return ok({ message });
  } catch (error) {
    return handleRouteError(error);
  }
}
