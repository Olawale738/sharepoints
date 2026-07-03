import { z } from "zod";

import { logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const updateSchema = z.object({
  action: z.enum(["REVOKE", "RESTORE"])
});

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const actor = await requireUser();
    await requireAnyWorkspaceAdmin(actor.id, "Only administrators can manage certificates.");
    const { id } = await context.params;
    const parsed = updateSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw new ApiError(422, "Invalid certificate action.");
    }

    const certificate = await prisma.memberCertificationBadge.update({
      where: { id },
      data:
        parsed.data.action === "REVOKE"
          ? { status: "REVOKED", revokedAt: new Date() }
          : { status: "ACTIVE", revokedAt: null }
    });

    await logActivity({
      userId: actor.id,
      action: parsed.data.action === "REVOKE" ? "certificate.revoked" : "certificate.restored",
      targetId: certificate.id,
      metadata: { title: certificate.title, certificateNumber: certificate.certificateNumber }
    });

    return ok({ certificate });
  } catch (error) {
    return handleRouteError(error);
  }
}
