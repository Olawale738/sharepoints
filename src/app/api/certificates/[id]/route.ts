import { z } from "zod";
import { PresidentialApprovalTargetType } from "@prisma/client";

import { logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { recordCertificateEvent, reissueCertificate } from "@/lib/certificate-lifecycle";
import { restoredCertificateData } from "@/lib/certificates";
import { requireCertificateIssuer } from "@/lib/official-issuance";
import { maybeQueuePresidentialApproval } from "@/lib/president-controls";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const updateSchema = z.object({
  action: z.enum(["REVOKE", "RESTORE", "REISSUE"]),
  reason: z.string().trim().max(1000).optional().nullable()
});

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const actor = await requireUser();
    await requireCertificateIssuer(actor.id);
    const { id } = await context.params;
    const parsed = updateSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw new ApiError(422, "Invalid certificate action.");
    }

    const existing = await prisma.memberCertificationBadge.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Certificate not found.");
    const pendingApproval = await maybeQueuePresidentialApproval({
      requesterId: actor.id,
      targetType: PresidentialApprovalTargetType.CERTIFICATE,
      targetId: id,
      title: `Certificate ${parsed.data.action.toLowerCase()} approval`,
      summary: `Approve ${parsed.data.action.toLowerCase()} for ${existing.certificateNumber ?? existing.title}.`,
      payload: parsed.data.action === "REISSUE"
        ? { action: "REISSUE", reason: parsed.data.reason ?? "Certificate reissued by president-approved request." }
        : { action: "UPDATE_STATUS", status: parsed.data.action === "REVOKE" ? "REVOKED" : "ACTIVE" }
    });
    if (pendingApproval) return ok({ pendingApproval }, { status: 202 });

    if (parsed.data.action === "REISSUE") {
      const replacement = await reissueCertificate({
        certificateId: id,
        actorId: actor.id,
        reason: parsed.data.reason ?? "Certificate reissued."
      });
      if (!replacement) throw new ApiError(404, "Certificate not found.");
      await logActivity({
        userId: actor.id,
        action: "certificate.reissued",
        targetId: replacement.id,
        metadata: { replacementOfId: id, certificateNumber: replacement.certificateNumber }
      });
      return ok({ certificate: replacement });
    }

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
    await recordCertificateEvent({
      certificateId: certificate.id,
      actorId: actor.id,
      eventType: parsed.data.action === "REVOKE" ? "REVOKED" : "RESTORED",
      summary: parsed.data.action === "REVOKE" ? "Certificate revoked." : "Certificate restored."
    });

    return ok({ certificate });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const actor = await requireUser();
    await requireCertificateIssuer(actor.id);
    const { id } = await context.params;
    const certificate = await prisma.memberCertificationBadge.findUnique({
      where: { id }
    });

    if (!certificate) {
      throw new ApiError(404, "Certificate not found.");
    }
    const pendingApproval = await maybeQueuePresidentialApproval({
      requesterId: actor.id,
      targetType: PresidentialApprovalTargetType.CERTIFICATE,
      targetId: id,
      title: "Certificate deletion approval",
      summary: `Approve deleting ${certificate.certificateNumber ?? certificate.title}.`,
      payload: { action: "DELETE" }
    });
    if (pendingApproval) return ok({ pendingApproval }, { status: 202 });

    await recordCertificateEvent({
      certificateId: id,
      actorId: actor.id,
      eventType: "DELETED",
      summary: "Certificate deleted from the active registry."
    });
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
