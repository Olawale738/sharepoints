import { ok, requireUser, handleRouteError } from "@/lib/api";
import { getOrgChatAudienceCounts, ensureOrgChatRooms, getUserOrgChatAudiences } from "@/lib/org-chat";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireUser();
    await ensureOrgChatRooms(user.id);

    const [{ readable, sendable }, audienceCounts] = await Promise.all([
      getUserOrgChatAudiences(user.id),
      getOrgChatAudienceCounts()
    ]);

    const rooms = await prisma.orgChatRoom.findMany({
      where: {
        audience: {
          in: readable
        }
      },
      include: {
        _count: {
          select: {
            messages: true
          }
        },
        messages: {
          orderBy: {
            createdAt: "desc"
          },
          take: 1,
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
      orderBy: {
        createdAt: "asc"
      }
    });

    return ok({
      rooms: rooms.map((room) => ({
        ...room,
        canSendMessages: sendable.includes(room.audience),
        audienceMembersCount: audienceCounts.get(room.audience) ?? 0
      }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
