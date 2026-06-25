import { ApiError, handleRouteError, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    const card = await prisma.digitalMembershipCard.findFirst({
      where: { qrToken: token, deletedAt: null }
    });
    if (!card) throw new ApiError(404, "Membership card not found.");

    const account = await prisma.user.findUnique({
      where: { id: card.userId },
      select: {
        name: true,
        image: true,
        suspendedAt: true,
        accessRevokedAt: true,
        deletedAt: true,
        memberProfile: {
          select: {
            membershipNumber: true,
            membershipStatus: true,
            membershipStartedAt: true,
            organizationPosition: true,
            digitalIdLocation: true
          }
        }
      }
    });
    const valid =
      card.status === "ACTIVE" &&
      (!card.expiresAt || card.expiresAt > new Date()) &&
      Boolean(account) &&
      !account?.suspendedAt &&
      !account?.accessRevokedAt &&
      !account?.deletedAt;

    return ok({
      valid,
      authentication: valid ? "CONFIRMED" : "REJECTED",
      organization: "Light Encounter Tabernacle Worldwide",
      organizationShortName: "LETTW",
      organizationId: card.organizationId,
      cardNumber: card.cardNumber,
      status: valid ? "ACTIVE" : card.status,
      issuedAt: card.issuedAt,
      expiresAt: card.expiresAt,
      member: valid
        ? {
            name: account?.name ?? "LETTW Member",
            membershipNumber: account?.memberProfile?.membershipNumber || card.cardNumber,
            membershipStatus: account?.memberProfile?.membershipStatus ?? "ACTIVE",
            memberSince: account?.memberProfile?.membershipStartedAt ?? card.issuedAt,
            position: account?.memberProfile?.organizationPosition ?? "Member",
            location: account?.memberProfile?.digitalIdLocation ?? "LETTW Worldwide"
          }
        : null,
      photoUrl:
        valid && account?.image?.startsWith("/api/profile/photo/")
          ? `/api/profile/photo/${card.userId}?token=${card.qrToken}`
          : valid
            ? account?.image ?? null
            : null
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
