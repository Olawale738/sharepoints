import { WorkspaceRole } from "@prisma/client";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { joinWorkspaceSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const parsed = joinWorkspaceSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid join request.");
    }

    const workspace = await prisma.workspace.findFirst({
      where: { id, deletedAt: null }
    });

    if (!workspace) {
      throw new ApiError(404, "Workspace not found.");
    }

    if (!parsed.data.joinCode || parsed.data.joinCode !== workspace.joinCode) {
      throw new ApiError(403, "Invalid workspace join code.");
    }

    const membership = await prisma.workspaceMember.upsert({
      where: {
        userId_workspaceId: {
          userId: user.id,
          workspaceId: id
        }
      },
      update: {},
      create: {
        userId: user.id,
        workspaceId: id,
        role: WorkspaceRole.USER
      }
    });

    await logActivity({
      userId: user.id,
      workspaceId: id,
      action: activityActions.userJoinedWorkspace,
      targetId: user.id,
      metadata: { role: membership.role }
    });

    return ok({ membership }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
