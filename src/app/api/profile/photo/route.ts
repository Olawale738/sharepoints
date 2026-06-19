import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { uploadObject } from "@/lib/storage";

export const runtime = "nodejs";

const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;

function detectedImageType(body: Buffer) {
  if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return "image/jpeg";
  if (body.length >= 12 && body.toString("ascii", 0, 4) === "RIFF" && body.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const formData = await request.formData();
    const file = formData.get("photo");
    if (!(file instanceof File)) throw new ApiError(422, "Choose a profile photo to upload.");
    if (file.size <= 0) throw new ApiError(422, "The selected photo is empty.");
    if (file.size > MAX_PROFILE_PHOTO_BYTES) throw new ApiError(413, "Profile photos must be 5 MB or smaller.");

    const body = Buffer.from(await file.arrayBuffer());
    const contentType = detectedImageType(body);
    if (!contentType || (file.type && file.type !== contentType)) {
      throw new ApiError(415, "Upload a valid JPEG, PNG, or WebP image.");
    }

    const storageKey = `profiles/${user.id}/avatar`;
    await uploadObject({ key: storageKey, body, contentType, contentLength: body.length });
    const imageUrl = `/api/profile/photo/${user.id}?v=${Date.now()}`;
    await prisma.user.update({ where: { id: user.id }, data: { image: imageUrl } });
    await logActivity({
      userId: user.id,
      action: activityActions.profilePhotoUploaded,
      targetId: user.id,
      metadata: { contentType, size: body.length }
    });
    return ok({ imageUrl });
  } catch (error) {
    return handleRouteError(error);
  }
}
