import { ApiError, handleRouteError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { ensureMembershipCredential, verifyMembershipCredential } from "@/lib/verifiable-credentials";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    const existing = await prisma.digitalMembershipCard.findFirst({
      where: { qrToken: token, deletedAt: null }
    });
    if (!existing) throw new ApiError(404, "Membership credential not found.");
    const { card, credential } = await ensureMembershipCredential(existing.id);
    const verification = await verifyMembershipCredential(card);
    if (!verification.signatureValid) {
      throw new ApiError(409, verification.reason ?? "Credential signature could not be verified.");
    }

    return new Response(credential, {
      headers: {
        "Content-Type": "application/vc+jwt",
        "Content-Disposition": `attachment; filename="${card.organizationId}.vc.jwt"`,
        "Cache-Control": "private, no-store",
        "X-LETW-Credential-Status": verification.statusValid ? "ACTIVE" : "INACTIVE"
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
