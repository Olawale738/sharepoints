import { z } from "zod";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole, requireAnyWorkspaceAdmin } from "@/lib/rbac";

const postSchema = z.object({
  title: z.string().trim().min(2).max(180),
  body: z.string().trim().min(2).max(10000),
  audienceType: z.enum(["LETW_WIDE", "ORGANIZATION_UNIT", "WORKSPACE", "LEADERSHIP"]).default("LETW_WIDE"),
  workspaceId: z.string().cuid().nullable().optional(),
  organizationUnitId: z.string().cuid().nullable().optional(),
  pinned: z.boolean().default(false)
});

export async function GET() {
  try {
    const user = await requireUser();
    const [posts, comments, reactions, canManage] = await Promise.all([
      prisma.internalNewsPost.findMany({
        orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
        take: 100
      }),
      prisma.internalNewsComment.findMany({ orderBy: { createdAt: "asc" }, take: 500 }),
      prisma.internalNewsReaction.findMany({ orderBy: { createdAt: "desc" }, take: 1000 }),
      hasAnyWorkspaceAdminRole(user.id)
    ]);
    return ok({ posts, comments, reactions, canManage });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id, "Only administrators can publish internal news.");
    const parsed = postSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid news post.");
    const data = parsed.data;
    const post = await prisma.internalNewsPost.create({
      data: {
        title: data.title,
        body: data.body,
        audienceType: data.audienceType,
        workspaceId: data.workspaceId ?? null,
        organizationUnitId: data.organizationUnitId ?? null,
        pinned: data.pinned,
        authorId: user.id
      }
    });
    await logActivity({
      userId: user.id,
      action: activityActions.newsPostCreated,
      targetId: post.id,
      metadata: { audienceType: post.audienceType }
    });
    return ok({ post }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
