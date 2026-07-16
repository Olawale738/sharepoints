import { auth } from "@/auth";
import { ApiError, handleRouteError } from "@/lib/api";
import { certificateIsLive } from "@/lib/certificates";
import { detectedImageType } from "@/lib/profile-photo";
import { prisma } from "@/lib/prisma";
import { getObjectBuffer } from "@/lib/storage";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ key: string[] }>;
};

async function canReadPublicCertificateAsset(request: Request, assetPath: string) {
  const url = new URL(request.url);
  const token = url.searchParams.get("certificateToken");
  if (!token) return false;

  const certificate = await prisma.memberCertificationBadge.findFirst({
    where: {
      verifyToken: token,
      OR: [
        { recipientPhotoUrl: assetPath },
        { spouseOnePhotoUrl: assetPath },
        { spouseTwoPhotoUrl: assetPath }
      ]
    }
  });

  return Boolean(certificate && certificateIsLive(certificate));
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { key } = await context.params;
    const storageKey = key.join("/");
    if (!storageKey.startsWith("certificates/assets/")) {
      throw new ApiError(404, "Certificate asset not found.");
    }

    const session = await auth();
    const assetPath = `/api/certificates/assets/${storageKey}`;
    if (!session?.user?.id && !(await canReadPublicCertificateAsset(request, assetPath))) {
      throw new ApiError(401, "Authentication required.");
    }

    const body = await getObjectBuffer(storageKey);
    if (!body.length) throw new ApiError(404, "Certificate asset not found.");
    const contentType = detectedImageType(body);
    if (!contentType) throw new ApiError(415, "Unsupported certificate asset.");

    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(body.length),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
