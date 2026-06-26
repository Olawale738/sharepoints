import { z } from "zod";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ postId: string }> };

const commentSchema = z.object({
  body: z.string().trim().min(1).max(2000)
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { postId } = await context.params;
    const post = await prisma.internalNewsPost.findUnique({ where: { id: postId } });
    if (!post || !post.commentsEnabled) throw new ApiError(404, "This news post cannot receive comments.");
    const parsed = commentSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid comment.");
    const comment = await prisma.internalNewsComment.create({
      data: {
        postId,
        authorId: user.id,
        body: parsed.data.body
      }
    });
    await logActivity({ userId: user.id, action: activityActions.newsCommentCreated, targetId: postId });
    return ok({ comment }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
