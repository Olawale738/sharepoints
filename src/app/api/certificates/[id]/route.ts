import { z } from "zod";

import { logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { restoredCertificateData } from "@/lib/certificates";
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

    const existing = await prisma.memberCertificationBadge.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Certificate not found.");

    const certificate = await prisma.memberCertificationBadge.update({
      where: { id },
      data:
        parsed.data.action === "REVOKE"
          ? { status: "REVOKED", revokedAt: new Date() }
          : restoredCertificateData(existing)
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

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const actor = await requireUser();
    await requireAnyWorkspaceAdmin(actor.id, "Only administrators can delete certificates.");
    const { id } = await context.params;
    const certificate = await prisma.memberCertificationBadge.findUnique({
      where: { id }
    });

    if (!certificate) {
      throw new ApiError(404, "Certificate not found.");
    }

    await prisma.memberCertificationBadge.delete({
      where: { id }
    });

    await logActivity({
      userId: actor.id,
      action: "certificate.deleted",
      targetId: id,
      metadata: {
        userId: certificate.userId,
        title: certificate.title,
        certificateNumber: certificate.certificateNumber
      }
    });

    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
