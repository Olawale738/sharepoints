import QRCode from "qrcode";
import { randomUUID } from "crypto";

import { ApiError, handleRouteError, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

type RouteContext = {
  params: Promise<{ resourceId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id);
    const { resourceId } = await context.params;
    const resource = await prisma.churchResource.findUnique({ where: { id: resourceId } });
    if (!resource) throw new ApiError(404, "Resource not found.");
    const pass = await prisma.smartResourcePass.upsert({
      where: { resourceId },
      update: { enabled: true },
      create: { resourceId, qrToken: randomUUID(), createdById: user.id }
    });
    const origin = new URL(request.url).origin;
    const svg = await QRCode.toString(`${origin}/dashboard/resource-check-in?token=${pass.qrToken}`, {
      type: "svg",
      margin: 1,
      color: { dark: "#0b1f33", light: "#ffffff" }
    });
    return new Response(svg, {
      headers: {
        "Content-Type": "image/svg+xml",
        "Content-Disposition": `inline; filename="${resource.name.replaceAll('"', "")}-qr.svg"`,
        "Cache-Control": "private, no-store"
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
