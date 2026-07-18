import { randomUUID } from "node:crypto";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { detectedImageType, MAX_PROFILE_PHOTO_BYTES } from "@/lib/profile-photo";
import { getOfficialIssuanceAuthority } from "@/lib/official-issuance";
import { uploadObject } from "@/lib/storage";

export const runtime = "nodejs";

const allowedKinds = new Set([
  "recipient-photo",
  "spouse-photo",
  "rector-signature",
  "president-signature",
  "second-signature",
  "certificate-image",
  "correction-photo"
]);

function extensionFor(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const authority = await getOfficialIssuanceAuthority(user.id);
    const formData = await request.formData();
    const kind = String(formData.get("kind") ?? "certificate-image");
    if (!allowedKinds.has(kind)) throw new ApiError(422, "Invalid certificate image type.");
    const canUploadAdmissionPhoto = kind === "recipient-photo" && authority.canManageSchoolAcademics;
    if (kind !== "correction-photo" && !canUploadAdmissionPhoto && !authority.canIssueCertificates && !authority.canIssueAcademicCertificates) {
      throw new ApiError(403, "Only certificate issuers, president-assigned rectors, or school secretaries uploading admission photos can upload this image.");
    }

    const file = formData.get("file");
    if (!(file instanceof File)) throw new ApiError(422, "Choose an image to upload.");
    if (file.size <= 0) throw new ApiError(422, "The selected image is empty.");
    if (file.size > MAX_PROFILE_PHOTO_BYTES) throw new ApiError(413, "Certificate images must be 5 MB or smaller.");

    const body = Buffer.from(await file.arrayBuffer());
    const contentType = detectedImageType(body);
    if (!contentType || (file.type && file.type !== contentType)) {
      throw new ApiError(415, "Upload a valid JPEG, PNG, or WebP image.");
    }

    const key = `certificates/assets/${user.id}/${kind}/${randomUUID()}.${extensionFor(contentType)}`;
    await uploadObject({ key, body, contentType, contentLength: body.length });
    const imageUrl = `/api/certificates/assets/${key}`;

    await logActivity({
      userId: user.id,
      action: activityActions.certificateAssetUploaded,
      targetId: key,
      metadata: { kind, contentType, size: body.length, uploadedFor: "certificate_asset" }
    });

    return ok({ imageUrl, key, contentType });
  } catch (error) {
    return handleRouteError(error);
  }
}
