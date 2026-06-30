import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { detectedImageType, MAX_PROFILE_PHOTO_BYTES, uploadProfilePhoto } from "@/lib/profile-photo";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    const actor = await requireUser();
    await requireAnyWorkspaceAdmin(actor.id, "Only administrators can upload member photos.");
    const { userId } = await context.params;
    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true }
    });
    if (!target) throw new ApiError(404, "Member not found.");

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

    const imageUrl = await uploadProfilePhoto({ userId, body, contentType });
    await logActivity({
      userId: actor.id,
      action: activityActions.profilePhotoUploaded,
      targetId: userId,
      metadata: { adminUpload: true, email: target.email, contentType, size: body.length }
    });

    return ok({ imageUrl });
  } catch (error) {
    return handleRouteError(error);
  }
}
