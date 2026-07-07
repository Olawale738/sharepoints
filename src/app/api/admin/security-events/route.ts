import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

export async function DELETE(request: Request) {
  try {
    const actor = await requireUser();
    await requireAnyWorkspaceAdmin(actor.id, "Only administrators can clear security history.");
    const body = (await request.json().catch(() => null)) as { confirmation?: string } | null;

    if (body?.confirmation !== "CLEAR SECURITY HISTORY") {
      throw new ApiError(422, "Enter CLEAR SECURITY HISTORY to clear security history.");
    }

    const result = await prisma.securityEvent.deleteMany({});
    await logActivity({
      userId: actor.id,
      action: "security.history_cleared",
      metadata: {
        clearedCount: result.count,
        clearedById: actor.id
      }
    });

    return ok({ cleared: true, count: result.count });
  } catch (error) {
    return handleRouteError(error);
  }
}
