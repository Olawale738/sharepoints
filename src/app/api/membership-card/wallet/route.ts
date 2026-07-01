import { handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { cardStatusTone } from "@/lib/qr-identity";

export async function GET() {
  try {
    const user = await requireUser();
    const [card, account] = await Promise.all([
      prisma.digitalMembershipCard.findFirst({ where: { userId: user.id, deletedAt: null } }),
      prisma.user.findUnique({
        where: { id: user.id },
        select: {
          name: true,
          email: true,
          image: true,
          memberProfile: {
            select: {
              membershipNumber: true,
              organizationPosition: true,
              digitalIdLocation: true,
              membershipStartedAt: true
            }
          }
        }
      })
    ]);

    return ok({
      configured: Boolean(process.env.APPLE_WALLET_PASS_TYPE_ID || process.env.GOOGLE_WALLET_ISSUER_ID),
      providers: {
        apple: Boolean(process.env.APPLE_WALLET_PASS_TYPE_ID && process.env.APPLE_WALLET_TEAM_ID),
        google: Boolean(process.env.GOOGLE_WALLET_ISSUER_ID)
      },
      message:
        process.env.APPLE_WALLET_PASS_TYPE_ID || process.env.GOOGLE_WALLET_ISSUER_ID
          ? "Wallet provider credentials are present. Native pass generation can be connected to this payload."
          : "Wallet provider credentials are not configured yet. This endpoint is ready for Apple/Google issuer setup.",
      card: card
        ? {
            organizationName: "Light Encounter Tabernacle Worldwide",
            organizationId: card.organizationId,
            cardNumber: card.cardNumber,
            membershipNumber: account?.memberProfile?.membershipNumber ?? card.cardNumber,
            memberName: account?.name ?? account?.email ?? "LETTW Member",
            position: account?.memberProfile?.organizationPosition ?? "Member",
            location: account?.memberProfile?.digitalIdLocation ?? "LETTW Worldwide",
            status: cardStatusTone(card),
            issuedAt: card.issuedAt,
            expiresAt: card.expiresAt,
            verifyUrl: `https://sharepoints.letw.org/verify/member/${card.qrToken}`,
            photoUrl: account?.image ?? null
          }
        : null
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
