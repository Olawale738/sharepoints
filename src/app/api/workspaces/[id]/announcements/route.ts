import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership, requireWorkspacePermission } from "@/lib/rbac";
import { createAnnouncementSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspaceMembership(user.id, id);

    const announcements = await prisma.workspaceAnnouncement.findMany({
      where: { workspaceId: id },
      include: {
        author: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 20
    });

    return ok({ announcements });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspacePermission(user.id, id, "canCreateAnnouncements");

    const body = await request.json();
    const parsed = createAnnouncementSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid announcement.");
    }

    const announcement = await prisma.workspaceAnnouncement.create({
      data: {
        workspaceId: id,
        authorId: user.id,
        title: parsed.data.title,
        body: parsed.data.body,
        pinned: parsed.data.pinned ?? false
      },
      include: {
        author: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    await logActivity({
      userId: user.id,
      workspaceId: id,
      action: activityActions.announcementCreated,
      targetId: announcement.id,
      metadata: { title: announcement.title, pinned: announcement.pinned }
    });

    return ok({ announcement }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
