import { ApiError, handleRouteError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getProtectedInlineResponse } from "@/lib/storage";

type RouteContext = {
  params: Promise<{ token: string }>;
};

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { token } = await context.params;
    const now = new Date();
    const guest = await prisma.externalGuestAccess.findUnique({ where: { token } });
    if (!guest || guest.revokedAt || guest.status !== "ACTIVE" || guest.expiresAt <= now || !guest.fileId) {
      throw new ApiError(404, "Guest file access is not active.");
    }

    const file = await prisma.file.findFirst({
      where: { id: guest.fileId, deletedAt: null },
      select: { id: true, fileName: true, fileType: true, storageKey: true, scanStatus: true }
    });
    if (!file) throw new ApiError(404, "File not found.");
    if (file.scanStatus === "INFECTED") throw new ApiError(423, "This document was blocked by security screening.");

    await prisma.externalGuestAccess.update({ where: { id: guest.id }, data: { lastViewedAt: now } }).catch(() => null);
    const response = await getProtectedInlineResponse(file.storageKey, file.fileName, file.fileType);
    response.headers.set("X-LETW-Guest-Preview", guest.id);
    response.headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
    response.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
