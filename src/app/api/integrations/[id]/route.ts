import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { requireWorkspacePermission } from "@/lib/rbac";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const integration = await prisma.integration.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        workspaceId: true
      }
    });

    if (!integration) {
      throw new ApiError(404, "Webhook not found.");
    }

    await requireWorkspacePermission(user.id, integration.workspaceId, "canManageIntegrations");

    await prisma.integration.delete({
      where: { id }
    });

    await logActivity({
      userId: user.id,
      workspaceId: integration.workspaceId,
      action: activityActions.integrationDeleted,
      targetId: integration.id,
      metadata: { name: integration.name }
    });

    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
