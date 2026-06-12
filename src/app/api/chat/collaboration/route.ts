import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import {
  MessageKind,
  requireChatScopeAccess,
  requireMessageAccess
} from "@/lib/message-collaboration";
import { prisma } from "@/lib/prisma";
import { chatCollaborationSchema } from "@/lib/validators";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const messageKind = url.searchParams.get("messageKind") as MessageKind | null;
    const scopeKind = url.searchParams.get("scopeKind") as MessageKind | null;
    const scopeId = url.searchParams.get("scopeId");
    const messageIds = (url.searchParams.get("messageIds") ?? "").split(",").filter(Boolean).slice(0, 100);

    if (!messageKind || !scopeKind || !scopeId) {
      throw new ApiError(422, "Chat scope is required.");
    }

    await requireChatScopeAccess(user.id, scopeKind, scopeId);
    const [reactions, receipts, bookmarks, pins, typing] = await Promise.all([
      prisma.messageReaction.findMany({
        where: {
          messageKind,
          messageId: { in: messageIds }
        },
        select: {
          messageId: true,
          emoji: true,
          userId: true
        }
      }),
      prisma.messageReadReceipt.groupBy({
        by: ["messageId"],
        where: {
          messageKind,
          messageId: { in: messageIds }
        },
        _count: { messageId: true }
      }),
      prisma.messageBookmark.findMany({
        where: {
          userId: user.id,
          messageKind,
          messageId: { in: messageIds }
        },
        select: { messageId: true }
      }),
      prisma.messagePin.findMany({
        where: {
          messageKind,
          messageId: { in: messageIds }
        },
        select: { messageId: true }
      }),
      prisma.chatTypingState.findMany({
        where: {
          scopeKind,
          scopeId,
          expiresAt: { gt: new Date() },
          userId: { not: user.id }
        },
        select: {
          user: {
            select: {
              name: true,
              email: true
            }
          }
        }
      })
    ]);

    return ok({
      reactions,
      receipts,
      bookmarkedMessageIds: bookmarks.map((bookmark) => bookmark.messageId),
      pinnedMessageIds: pins.map((pin) => pin.messageId),
      typingUsers: typing.map((state) => state.user.name ?? state.user.email ?? "Member")
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = chatCollaborationSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid chat action.");
    }

    if (parsed.data.action === "TYPING") {
      if (!parsed.data.scopeKind || !parsed.data.scopeId) {
        throw new ApiError(422, "Chat scope is required.");
      }

      await requireChatScopeAccess(user.id, parsed.data.scopeKind, parsed.data.scopeId);

      if (parsed.data.active === false) {
        await prisma.chatTypingState.deleteMany({
          where: {
            userId: user.id,
            scopeKind: parsed.data.scopeKind,
            scopeId: parsed.data.scopeId
          }
        });
      } else {
        await prisma.chatTypingState.upsert({
          where: {
            userId_scopeKind_scopeId: {
              userId: user.id,
              scopeKind: parsed.data.scopeKind,
              scopeId: parsed.data.scopeId
            }
          },
          update: {
            expiresAt: new Date(Date.now() + 8_000)
          },
          create: {
            userId: user.id,
            scopeKind: parsed.data.scopeKind,
            scopeId: parsed.data.scopeId,
            expiresAt: new Date(Date.now() + 8_000)
          }
        });
      }

      return ok({ updated: true });
    }

    if (!parsed.data.messageKind || !parsed.data.messageId) {
      throw new ApiError(422, "Message is required.");
    }

    const access = await requireMessageAccess(user.id, parsed.data.messageKind, parsed.data.messageId);

    if (parsed.data.action === "REACT") {
      if (!parsed.data.emoji) {
        throw new ApiError(422, "Choose a reaction.");
      }

      const existing = await prisma.messageReaction.findUnique({
        where: {
          userId_messageKind_messageId_emoji: {
            userId: user.id,
            messageKind: parsed.data.messageKind,
            messageId: parsed.data.messageId,
            emoji: parsed.data.emoji
          }
        }
      });

      if (existing) {
        await prisma.messageReaction.delete({ where: { id: existing.id } });
      } else {
        await prisma.messageReaction.create({
          data: {
            userId: user.id,
            messageKind: parsed.data.messageKind,
            messageId: parsed.data.messageId,
            emoji: parsed.data.emoji
          }
        });
      }
    }

    if (parsed.data.action === "BOOKMARK") {
      const existing = await prisma.messageBookmark.findUnique({
        where: {
          userId_messageKind_messageId: {
            userId: user.id,
            messageKind: parsed.data.messageKind,
            messageId: parsed.data.messageId
          }
        }
      });

      if (existing) {
        await prisma.messageBookmark.delete({ where: { id: existing.id } });
      } else {
        await prisma.messageBookmark.create({
          data: {
            userId: user.id,
            messageKind: parsed.data.messageKind,
            messageId: parsed.data.messageId
          }
        });
      }
    }

    if (parsed.data.action === "PIN") {
      const existing = await prisma.messagePin.findUnique({
        where: {
          messageKind_messageId: {
            messageKind: parsed.data.messageKind,
            messageId: parsed.data.messageId
          }
        }
      });

      if (existing) {
        await prisma.messagePin.delete({ where: { id: existing.id } });
      } else {
        await prisma.messagePin.create({
          data: {
            pinnedById: user.id,
            workspaceId: access.workspaceId,
            messageKind: parsed.data.messageKind,
            messageId: parsed.data.messageId
          }
        });
      }
    }

    if (parsed.data.action === "READ") {
      await prisma.messageReadReceipt.upsert({
        where: {
          userId_messageKind_messageId: {
            userId: user.id,
            messageKind: parsed.data.messageKind,
            messageId: parsed.data.messageId
          }
        },
        update: {
          readAt: new Date()
        },
        create: {
          userId: user.id,
          messageKind: parsed.data.messageKind,
          messageId: parsed.data.messageId
        }
      });
    }

    return ok({ updated: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
