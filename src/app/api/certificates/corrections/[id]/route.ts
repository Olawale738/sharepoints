import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { approveCertificateCorrectionRequest, rejectCertificateCorrectionRequest } from "@/lib/certificate-corrections";
import { requireAcademicCertificateIssuer, requireCertificateIssuer } from "@/lib/official-issuance";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const reviewSchema = z.object({
  action: z.enum(["APPROVE", "REJECT"]),
  reviewNote: z.string().trim().max(1200).optional().nullable()
});

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const actor = await requireUser();
    const { id } = await context.params;
    const parsed = reviewSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, "Invalid correction review action.");

    const correctionRequest = await prisma.certificateCorrectionRequest.findUnique({ where: { id } });
    if (!correctionRequest) throw new ApiError(404, "Certificate correction request not found.");
    const certificate = await prisma.memberCertificationBadge.findUnique({ where: { id: correctionRequest.certificateId } });
    if (!certificate) throw new ApiError(404, "Certificate not found.");

    if (certificate.certificateCategory === "EDUCATION") {
      await requireAcademicCertificateIssuer(actor.id);
    } else {
      await requireCertificateIssuer(actor.id);
    }

    if (parsed.data.action === "APPROVE") {
      const replacement = await approveCertificateCorrectionRequest({
        requestId: id,
        actorId: actor.id,
        reviewNote: parsed.data.reviewNote
      });
      return ok({ correctionRequestId: id, replacement });
    }

    const rejected = await rejectCertificateCorrectionRequest({
      requestId: id,
      actorId: actor.id,
      reviewNote: parsed.data.reviewNote
    });
    return ok({ correctionRequest: rejected });
  } catch (error) {
    return handleRouteError(error);
  }
}
