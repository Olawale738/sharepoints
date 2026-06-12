import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { notificationPreferenceSchema } from "@/lib/validators";

export async function GET() {
  try {
    const user = await requireUser();
    const [notifications, unreadCount, preference] = await Promise.all([
      prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 50
      }),
      prisma.notification.count({
        where: {
          userId: user.id,
          readAt: null
        }
      }),
      prisma.notificationPreference.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id }
      })
    ]);

    return ok({ notifications, unreadCount, preference });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();

    if (body.action === "READ_ALL") {
      await prisma.notification.updateMany({
        where: {
          userId: user.id,
          readAt: null
        },
        data: {
          readAt: new Date()
        }
      });
      return ok({ updated: true });
    }

    if (body.action === "READ" && typeof body.id === "string") {
      const result = await prisma.notification.updateMany({
        where: {
          id: body.id,
          userId: user.id
        },
        data: {
          readAt: new Date()
        }
      });

      if (!result.count) {
        throw new ApiError(404, "Notification not found.");
      }

      return ok({ updated: true });
    }

    const parsed = notificationPreferenceSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid notification settings.");
    }

    const preference = await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      update: parsed.data,
      create: {
        userId: user.id,
        ...parsed.data
      }
    });

    return ok({ preference });
  } catch (error) {
    return handleRouteError(error);
  }
}
