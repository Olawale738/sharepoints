import { WorkspaceRole } from "@prisma/client";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { joinWorkspaceSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json().catch(() => ({}));
    const parsed = joinWorkspaceSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Enter a valid join code.");
    }

    const workspace = await prisma.workspace.findFirst({
      where: { joinCode: parsed.data.joinCode, deletedAt: null },
      select: {
        id: true,
        name: true
      }
    });

    if (!workspace) {
      throw new ApiError(404, "No workspace matches that join code.");
    }

    const membership = await prisma.workspaceMember.upsert({
      where: {
        userId_workspaceId: {
          userId: user.id,
          workspaceId: workspace.id
        }
      },
      update: {},
      create: {
        userId: user.id,
        workspaceId: workspace.id,
        role: WorkspaceRole.USER
      }
    });

    await logActivity({
      userId: user.id,
      workspaceId: workspace.id,
      action: activityActions.userJoinedWorkspace,
      targetId: user.id,
      metadata: { role: membership.role }
    });

    return ok({ workspace, membership }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
