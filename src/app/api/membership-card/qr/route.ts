import QRCode from "qrcode";

import { ApiError, handleRouteError, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const card = await prisma.digitalMembershipCard.findFirst({
      where: {
        userId: user.id,
        deletedAt: null,
        status: "ACTIVE",
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
      }
    });
    if (!card) throw new ApiError(404, "A digital membership card has not been issued to this account.");
    const origin = new URL(request.url).origin;
    const svg = await QRCode.toString(`${origin}/verify/member/${card.qrToken}`, {
      type: "svg",
      margin: 1,
      color: { dark: "#0b1f33", light: "#ffffff" }
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
