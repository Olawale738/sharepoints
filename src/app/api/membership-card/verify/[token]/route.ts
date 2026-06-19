import { ApiError, handleRouteError, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    const card = await prisma.digitalMembershipCard.findUnique({ where: { qrToken: token } });
    if (!card) throw new ApiError(404, "Membership card not found.");
    const account = await prisma.user.findUnique({
      where: { id: card.userId },
      select: {
        name: true,
        image: true,
        memberProfile: { select: { membershipNumber: true, membershipStatus: true } }
      }
    });
    return ok({
      valid: card.status === "ACTIVE" && (!card.expiresAt || card.expiresAt > new Date()),
      cardNumber: card.cardNumber,
      organization: "LETW.ORG",
      organizationId: card.organizationId,
      status: card.status,
      expiresAt: card.expiresAt,
      member: card.status === "ACTIVE" ? account : null,
      photoUrl: card.status === "ACTIVE" ? `/api/profile/photo/${card.userId}?token=${card.qrToken}` : null
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
