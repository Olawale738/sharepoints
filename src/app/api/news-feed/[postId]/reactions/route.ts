import { z } from "zod";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ postId: string }> };

const reactionSchema = z.object({
  reaction: z.enum(["LIKE", "AMEN", "PRAYING", "CELEBRATE"])
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { postId } = await context.params;
    const post = await prisma.internalNewsPost.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) throw new ApiError(404, "News post not found.");
    const parsed = reactionSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, "Invalid reaction.");
    const reaction = await prisma.internalNewsReaction.upsert({
      where: {
        postId_userId_reaction: {
          postId,
          userId: user.id,
          reaction: parsed.data.reaction
        }
      },
      update: {},
      create: {
        postId,
        userId: user.id,
        reaction: parsed.data.reaction
      }
    });
    await logActivity({
      userId: user.id,
      action: activityActions.newsReactionCreated,
      targetId: postId,
      metadata: { reaction: parsed.data.reaction }
    });
    return ok({ reaction });
  } catch (error) {
    return handleRouteError(error);
  }
}
