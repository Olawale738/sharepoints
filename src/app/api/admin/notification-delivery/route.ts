import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export async function GET() {
  try {
    const user = await requireUser();
    if (!(await hasAnyWorkspaceAdminRole(user.id))) {
      throw new ApiError(403, "Only administrators can view notification delivery.");
    }

    const [events, grouped, totalNotifications, pendingNotifications] = await Promise.all([
      prisma.notificationDeliveryEvent.findMany({
        include: {
          notification: {
            select: {
              title: true,
              body: true,
              href: true,
              priority: true,
              type: true,
              createdAt: true
            }
          },
          user: {
            select: {
              name: true,
              email: true
            }
          }
        },
        orderBy: { createdAt: "desc" },
        take: 200
      }),
      prisma.notificationDeliveryEvent.groupBy({
        by: ["channel", "status"],
        _count: { id: true }
      }),
      prisma.notification.count(),
      prisma.notification.count({
        where: {
          OR: [
            { deliveredAt: null },
            { emailSentAt: null },
            { pushSentAt: null }
          ]
        }
      })
    ]);

    return ok({
      events,
      grouped: grouped.map((item) => ({
        channel: item.channel,
        status: item.status,
        count: item._count.id
      })),
      totals: {
        notifications: totalNotifications,
        pendingNotifications,
        events: grouped.reduce((total, item) => total + item._count.id, 0)
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
