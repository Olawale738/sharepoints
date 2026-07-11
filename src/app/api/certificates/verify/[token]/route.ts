import { ApiError, handleRouteError, ok } from "@/lib/api";
import { certificateIsLive, certificatePublicStatus } from "@/lib/certificates";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    const badge = await prisma.memberCertificationBadge.findUnique({ where: { verifyToken: token } });
    if (!badge) throw new ApiError(404, "Certificate not found.");
    const user = await prisma.user.findUnique({
      where: { id: badge.userId },
      select: {
        name: true,
        email: true,
        memberProfile: { select: { membershipNumber: true, organizationPosition: true } }
      }
    });
    const valid = certificateIsLive(badge);
    return ok({
      valid,
      organization: "Light Encounter Tabernacle Worldwide",
      certificate: {
        title: badge.title,
        certificateNumber: badge.certificateNumber,
        issuer: badge.issuer,
        status: certificatePublicStatus(badge),
        issuedAt: badge.issuedAt,
        expiresAt: badge.expiresAt
      },
      member: valid
        ? {
            name: user?.name ?? "LETTW Member",
            membershipNumber: user?.memberProfile?.membershipNumber ?? null,
            position: user?.memberProfile?.organizationPosition ?? "Member"
          }
        : null
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
