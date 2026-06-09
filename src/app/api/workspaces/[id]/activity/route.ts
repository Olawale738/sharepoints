import { handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceAdminAccess } from "@/lib/rbac";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;

    await requireWorkspaceAdminAccess(user.id, id, "Only admins can clear workspace activity logs.");

    const result = await prisma.activityLog.deleteMany({
      where: {
        workspaceId: id
      }
    });

    return ok({
      cleared: true,
      count: result.count
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
