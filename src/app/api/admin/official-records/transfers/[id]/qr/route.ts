import QRCode from "qrcode";

import { ApiError, handleRouteError, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    if (!(await hasAnyWorkspaceAdminRole(user.id))) throw new ApiError(403, "Only administrators can view transfer QR codes.");
    const { id } = await context.params;
    const transfer = await prisma.pastorTransferPosting.findUnique({ where: { id }, select: { verifyToken: true } });
    if (!transfer) throw new ApiError(404, "Pastor transfer not found.");
    const origin = new URL(request.url).origin;
    const svg = await QRCode.toString(`${origin}/verify/transfer/${transfer.verifyToken}`, {
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
