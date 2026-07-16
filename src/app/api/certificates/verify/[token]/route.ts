import { ApiError, handleRouteError, ok } from "@/lib/api";
import { recordCertificateEvent } from "@/lib/certificate-lifecycle";
import { certificateIsLive, certificatePublicStatus } from "@/lib/certificates";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    const badge = await prisma.memberCertificationBadge.findUnique({ where: { verifyToken: token } });
    if (!badge) throw new ApiError(404, "Certificate not found.");
    const user = badge.userId
      ? await prisma.user.findUnique({
          where: { id: badge.userId },
          select: {
            name: true,
            email: true,
            memberProfile: { select: { membershipNumber: true, organizationPosition: true } }
          }
        })
      : null;
    const valid = certificateIsLive(badge);
    await recordCertificateEvent({
      certificateId: badge.id,
      eventType: "API_VERIFIED",
      summary: "Certificate verification API checked.",
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: request.headers.get("user-agent")
    }).catch(() => null);
    const timeline = await prisma.certificateEvent.findMany({
      where: { certificateId: badge.id },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { eventType: true, summary: true, createdAt: true }
    });
    return ok({
      valid,
      organization: "Light Encounter Tabernacle Worldwide",
      certificate: {
        title: badge.title,
        certificateNumber: badge.certificateNumber,
        sealNumber: badge.sealNumber,
        category: badge.certificateCategory,
        preset: badge.certificatePreset,
        educationLevel: badge.educationLevel,
        programName: badge.programName,
        fieldOfStudy: badge.fieldOfStudy,
        spouseOneName: badge.spouseOneName,
        spouseTwoName: badge.spouseTwoName,
        marriageDate: badge.marriageDate,
        marriageLocation: badge.marriageLocation,
        officiantName: badge.officiantName,
        secondSignatoryName: badge.secondSignatoryName,
        secondSignatoryTitle: badge.secondSignatoryTitle,
        replacementOfId: badge.replacementOfId,
        replacedById: badge.replacedById,
        credentialHash: valid ? badge.credentialHash : null,
        issuer: badge.issuer,
        status: certificatePublicStatus(badge),
        issuedAt: badge.issuedAt,
        expiresAt: badge.expiresAt
      },
      member: valid
        ? {
            name: user?.name ?? badge.recipientName ?? "LETW Certificate Holder",
            membershipNumber: user?.memberProfile?.membershipNumber ?? null,
            position: user?.memberProfile?.organizationPosition ?? badge.educationLevel ?? badge.programName ?? "Certificate holder"
          }
        : null,
      timeline
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
