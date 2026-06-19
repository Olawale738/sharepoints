import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

export async function DELETE(request: Request) {
  try {
    const actor = await requireUser();
    await requireAnyWorkspaceAdmin(actor.id, "Only administrators can clear organization activity logs.");
    const body = (await request.json().catch(() => null)) as { confirmation?: string } | null;
    if (body?.confirmation !== "CLEAR ALL LETW ACTIVITY") {
      throw new ApiError(422, "Enter the required confirmation phrase.");
    }
    const cleared = await prisma.$transaction(async (tx) => {
      const result = await tx.activityLog.deleteMany({});
      await tx.securityEvent.create({
        data: {
          userId: actor.id,
          email: actor.email,
          type: "ACTIVITY_LOGS_CLEARED",
          metadata: {
            scope: "ORGANIZATION",
            clearedCount: result.count,
            clearedById: actor.id
          }
        }
      });
      return result.count;
    });
    return ok({ cleared: true, count: cleared });
  } catch (error) {
    return handleRouteError(error);
  }
}
