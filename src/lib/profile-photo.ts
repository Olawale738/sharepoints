import { prisma } from "@/lib/prisma";
import { uploadObject } from "@/lib/storage";

export const MAX_PROFILE_PHOTO_BYTES = 5 * 1024 * 1024;

export function detectedImageType(body: Buffer) {
  if (body.length >= 8 && body.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return "image/jpeg";
  if (body.length >= 12 && body.toString("ascii", 0, 4) === "RIFF" && body.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export async function uploadProfilePhoto(input: {
  userId: string;
  body: Buffer;
  contentType: string;
}) {
  const storageKey = `profiles/${input.userId}/avatar`;
  await uploadObject({
    key: storageKey,
    body: input.body,
    contentType: input.contentType,
    contentLength: input.body.length
  });
  const imageUrl = `/api/profile/photo/${input.userId}?v=${Date.now()}`;
  await prisma.user.update({ where: { id: input.userId }, data: { image: imageUrl } });
  return imageUrl;
}
