import QRCode from "qrcode";

import { ApiError, handleRouteError, requireUser } from "@/lib/api";
import { getOfficialIssuanceAuthority } from "@/lib/official-issuance";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const certificate = await prisma.memberCertificationBadge.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        verifyToken: true
      }
    });

    if (!certificate) {
      throw new ApiError(404, "Certificate not found.");
    }

    const [isAdmin, authority] = await Promise.all([
      hasAnyWorkspaceAdminRole(user.id),
      getOfficialIssuanceAuthority(user.id)
    ]);

    if (!isAdmin && !authority.canIssueCertificates && certificate.userId !== user.id) {
      throw new ApiError(403, "You cannot view this certificate QR code.");
    }

    const origin = new URL(request.url).origin;
    const svg = await QRCode.toString(`${origin}/verify/certificate/${certificate.verifyToken}`, {
      type: "svg",
      errorCorrectionLevel: "H",
      margin: 2,
      color: {
        dark: "#0b1b3d",
        light: "#ffffff"
      }
    });

    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
