import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

export async function DELETE(request: Request) {
  try {
    const actor = await requireUser();
    await requireAnyWorkspaceAdmin(actor.id, "Only administrators can clear AI access audits.");
    const body = (await request.json().catch(() => null)) as { confirmation?: string } | null;

    if (body?.confirmation !== "CLEAR AI ACCESS AUDIT") {
      throw new ApiError(422, "Enter CLEAR AI ACCESS AUDIT to clear AI access audit records.");
    }

    const result = await prisma.aiAssistantAudit.deleteMany({});
    await prisma.securityEvent.create({
      data: {
        userId: actor.id,
        email: actor.email,
        type: "ACTIVITY_LOGS_CLEARED",
        metadata: {
          scope: "AI_ACCESS_AUDIT",
          clearedCount: result.count,
          clearedById: actor.id
        }
      }
    });

    return ok({ cleared: true, count: result.count });
  } catch (error) {
    return handleRouteError(error);
  }
}
