import { ApiError, handleRouteError, ok } from "@/lib/api";
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
    const valid = badge.status === "ACTIVE" && !badge.revokedAt && (!badge.expiresAt || badge.expiresAt > new Date());
    return ok({
      valid,
      organization: "Light Encounter Tabernacle Worldwide",
      certificate: {
        title: badge.title,
        certificateNumber: badge.certificateNumber,
        issuer: badge.issuer,
        status: valid ? "VALID" : badge.revokedAt ? "REVOKED" : badge.expiresAt && badge.expiresAt <= new Date() ? "EXPIRED" : badge.status,
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
