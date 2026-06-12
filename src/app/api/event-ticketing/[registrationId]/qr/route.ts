import QRCode from "qrcode";

import { ApiError, handleRouteError, requireUser } from "@/lib/api";
import { isOperationsManager } from "@/lib/operations";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ registrationId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { registrationId } = await context.params;
    const registration = await prisma.eventRegistration.findUnique({ where: { id: registrationId } });
    if (!registration) throw new ApiError(404, "Ticket not found.");
    if (registration.userId !== user.id && !(await isOperationsManager(user.id))) {
      throw new ApiError(403, "You cannot access this ticket.");
    }
    const origin = new URL(request.url).origin;
    const value = `${origin}/dashboard/operations?tab=events&checkin=${encodeURIComponent(registration.qrToken)}`;
    const svg = await QRCode.toString(value, {
      type: "svg",
      margin: 1,
      color: { dark: "#0E2A27", light: "#FFFFFF" },
      errorCorrectionLevel: "M"
    });
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Cache-Control": "private, max-age=300"
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
