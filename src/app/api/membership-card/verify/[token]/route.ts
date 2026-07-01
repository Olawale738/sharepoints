import { createHash } from "node:crypto";

import { ApiError, handleRouteError, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { ensureMembershipCredential, verifyMembershipCredential } from "@/lib/verifiable-credentials";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    const existing = await prisma.digitalMembershipCard.findFirst({
      where: {
        deletedAt: null,
        OR: [{ qrToken: token }, { organizationId: token }]
      }
    });
    if (!existing) throw new ApiError(404, "Membership card not found.");
    const { card, account } = await ensureMembershipCredential(existing.id);
    const verification = await verifyMembershipCredential(card);

    const valid = verification.valid;
    const forwardedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const ipHash = createHash("sha256")
      .update(`${process.env.AUTH_SECRET ?? "letw-verification"}:${forwardedIp}`)
      .digest("hex");
    await prisma.digitalIdentityVerification.create({
      data: {
        cardId: card.id,
        organizationId: card.organizationId,
        outcome: valid ? "VALID" : verification.signatureValid ? "STATUS_INVALID" : "SIGNATURE_INVALID",
        ipHash,
        userAgent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
        credentialId: verification.credentialId,
        keyId: verification.keyId,
        signatureValid: verification.signatureValid,
        statusValid: verification.statusValid
      }
    });

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
      cryptographicVerification: {
        signatureValid: verification.signatureValid,
        liveStatusValid: verification.statusValid,
        algorithm: "EdDSA",
        keyId: verification.keyId,
        credentialId: verification.credentialId,
        issuer: "https://letw.org",
        publicKeysUrl: "/api/credentials/jwks",
        credentialUrl: `/api/credentials/member/${card.qrToken}`
      },
      member: valid
        ? {
            name: account.name ?? "LETTW Member",
            membershipNumber: account.memberProfile?.membershipNumber || card.cardNumber,
            membershipStatus: account.memberProfile?.membershipStatus ?? "ACTIVE",
            memberSince: account.memberProfile?.membershipStartedAt ?? card.issuedAt,
            position: account.memberProfile?.organizationPosition ?? "Member",
            location: account.memberProfile?.digitalIdLocation ?? "LETTW Worldwide"
          }
        : null,
      photoUrl:
        valid && account.image?.startsWith("/api/profile/photo/")
          ? `/api/profile/photo/${card.userId}?token=${card.qrToken}`
          : valid
            ? account.image ?? null
            : null
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
