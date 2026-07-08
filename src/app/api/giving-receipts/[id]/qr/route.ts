import QRCode from "qrcode";

import { ApiError, handleRouteError, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const receipt = await prisma.givingReceipt.findUnique({ where: { id } });
    if (!receipt) throw new ApiError(404, "Giving receipt not found.");
    const isAdmin = await hasAnyWorkspaceAdminRole(user.id);
    if (!isAdmin && receipt.userId !== user.id && receipt.issuedById !== user.id && receipt.donorEmail !== user.email?.toLowerCase()) {
      throw new ApiError(403, "You cannot view this giving receipt QR code.");
    }
    const origin = new URL(request.url).origin;
    const svg = await QRCode.toString(`${origin}/verify/giving/${receipt.qrToken}`, {
      type: "svg",
      margin: 1,
      width: 260,
      color: { dark: "#0B1B3D", light: "#FFFFFF" },
      errorCorrectionLevel: "H"
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
