import QRCode from "qrcode";

import { ApiError, handleRouteError, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

type RouteContext = { params: Promise<{ sessionId: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id);
    const { sessionId } = await context.params;
    const session = await prisma.smartAttendanceSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new ApiError(404, "Attendance session not found.");
    const origin = new URL(request.url).origin;
    const svg = await QRCode.toString(`${origin}/dashboard/attendance/${session.qrToken}`, {
      type: "svg",
      errorCorrectionLevel: "M",
      margin: 4,
      color: { dark: "#001D3D", light: "#FFFFFF" }
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
