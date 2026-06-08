import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { createChatMessageSchema } from "@/lib/validators";
import { requireWorkspaceChannelMembership, requireWorkspaceChannelSendAccess } from "@/lib/workspace-chat-access";

type RouteContext = {
  params: Promise<{ channelId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { channelId } = await context.params;
    await requireWorkspaceChannelMembership(user.id, channelId);

    const { searchParams } = new URL(request.url);
    const take = Math.min(Number(searchParams.get("take") ?? 50), 100);
    const messages = await prisma.chatMessage.findMany({
      where: { channelId },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        },
        attachmentFile: {
          select: {
            id: true,
            fileName: true,
            fileType: true,
            size: true
          }
        }
      },
      orderBy: { createdAt: "desc" },
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
    const { channelId } = await context.params;
    const channel = await requireWorkspaceChannelSendAccess(user.id, channelId);

    const body = await request.json();
    const parsed = createChatMessageSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid message.");
    }

    if (parsed.data.attachmentFileId) {
      const file = await prisma.file.findFirst({
        where: {
          id: parsed.data.attachmentFileId,
          workspaceId: channel.workspaceId
        },
        select: { id: true }
      });

      if (!file) {
        throw new ApiError(404, "Attachment file not found in this workspace.");
      }
    }

    const message = await prisma.chatMessage.create({
      data: {
        channelId,
        authorId: user.id,
        body: parsed.data.body,
        attachmentFileId: parsed.data.attachmentFileId || null
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        },
        attachmentFile: {
          select: {
            id: true,
            fileName: true,
            fileType: true,
            size: true
          }
        }
      }
    });

    await logActivity({
      userId: user.id,
      workspaceId: channel.workspaceId,
      action: activityActions.messageCreated,
      targetId: message.id,
      metadata: { channelId }
    });

    return ok({ message }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
