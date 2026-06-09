import { ApiError } from "@/lib/api";
import { messageDeleteWindowMs } from "@/lib/message-constants";

export function ensureMessageAuthor(authorId: string | null | undefined, userId: string) {
  if (!authorId || authorId !== userId) {
    throw new ApiError(403, "You can only change your own messages.");
  }
}

export function ensureMessageIsNotDeleted(deletedAt?: Date | null) {
  if (deletedAt) {
    throw new ApiError(409, "Deleted messages cannot be changed.");
  }
}

export function ensureMessageCanStillBeDeleted(createdAt: Date, now = new Date()) {
  if (now.getTime() - createdAt.getTime() > messageDeleteWindowMs) {
    throw new ApiError(409, "Messages can only be deleted within 20 minutes.");
  }
}
