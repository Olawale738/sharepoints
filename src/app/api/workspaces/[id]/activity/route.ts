import { handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireWorkspacePermission } from "@/lib/rbac";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;

    await requireWorkspacePermission(user.id, id, "canClearActivity");

    const result = await prisma.$transaction(async (tx) => {
      const cleared = await tx.activityLog.deleteMany({
        where: {
          workspaceId: id
        }
      });
      await tx.securityEvent.create({
        data: {
          userId: user.id,
          email: user.email,
          type: "ACTIVITY_LOGS_CLEARED",
          metadata: {
            workspaceId: id,
            clearedCount: cleared.count
          }
        }
      });
      return cleared;
    });

    return ok({
      cleared: true,
      count: result.count
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
