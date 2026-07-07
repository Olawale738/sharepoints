import { auth } from "@/auth";
import { ApiError, handleRouteError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getObjectBuffer } from "@/lib/storage";

type RouteContext = { params: Promise<{ userId: string }> };

function detectedImageType(body: Buffer) {
  if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return "image/jpeg";
  if (body.length >= 12 && body.toString("ascii", 0, 4) === "RIFF" && body.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return "application/octet-stream";
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { userId } = await context.params;
    const url = new URL(request.url);
    const session = await auth();
    if (!session?.user?.id) {
      const token = url.searchParams.get("token");
      const certificateToken = url.searchParams.get("certificateToken");
      const [card, certificate, account] = token || certificateToken
        ? await Promise.all([
            token
              ? prisma.digitalMembershipCard.findFirst({
                  where: {
                    userId,
                    qrToken: token,
                    status: "ACTIVE",
                    deletedAt: null,
                    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
                  }
                })
              : null,
            certificateToken
              ? prisma.memberCertificationBadge.findFirst({
                  where: {
                    userId,
                    verifyToken: certificateToken,
                    status: "ACTIVE",
                    revokedAt: null,
                    OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
                  }
                })
              : null,
            prisma.user.findUnique({
              where: { id: userId },
              select: { suspendedAt: true, accessRevokedAt: true, deletedAt: true }
            })
          ])
        : [null, null, null];
      if ((!card && !certificate) || !account || account.suspendedAt || account.accessRevokedAt || account.deletedAt) {
        throw new ApiError(401, "Authentication required.");
      }
    }
    const body = await getObjectBuffer(`profiles/${userId}/avatar`);
    if (!body.length) throw new ApiError(404, "Profile photo not found.");
    return new Response(body, {
      headers: {
        "Content-Type": detectedImageType(body),
        "Content-Length": String(body.length),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
