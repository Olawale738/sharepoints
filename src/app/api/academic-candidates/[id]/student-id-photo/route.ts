import { ApiError, handleRouteError } from "@/lib/api";
import { detectedImageType } from "@/lib/profile-photo";
import { prisma } from "@/lib/prisma";
import { getObjectBuffer } from "@/lib/storage";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function storageKeyFromAssetUrl(value?: string | null) {
  const prefix = "/api/certificates/assets/";
  if (!value?.startsWith(prefix)) return null;
  return decodeURIComponent(value.slice(prefix.length).split("?")[0] ?? "");
}

function isLiveStudentId(candidate: { studentIdNumber?: string | null; studentIdStatus?: string | null; studentIdExpiresAt?: Date | null }) {
  return Boolean(
    candidate.studentIdNumber &&
      (!candidate.studentIdStatus || candidate.studentIdStatus === "ACTIVE") &&
      (!candidate.studentIdExpiresAt || candidate.studentIdExpiresAt > new Date())
  );
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const candidate = await prisma.academicCandidate.findUnique({
      where: { id },
      select: {
        photoUrl: true,
        studentIdNumber: true,
        studentIdStatus: true,
        studentIdExpiresAt: true
      }
    });

    if (!candidate || !isLiveStudentId(candidate)) {
      throw new ApiError(404, "Student ID photo not found.");
    }

    const key = storageKeyFromAssetUrl(candidate.photoUrl);
    if (!key) {
      throw new ApiError(404, "Student ID photo not found.");
    }

    const body = await getObjectBuffer(key);
    if (!body.length) throw new ApiError(404, "Student ID photo not found.");
    const contentType = detectedImageType(body);
    if (!contentType) throw new ApiError(415, "Unsupported Student ID photo.");

    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(body.length),
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow, noarchive"
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
