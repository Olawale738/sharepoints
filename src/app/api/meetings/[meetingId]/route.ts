import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { meetingInclude, meetingInviteUrl } from "@/lib/meetings";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceAdminAccess } from "@/lib/rbac";

type RouteContext = {
  params: Promise<{ meetingId: string }>;
};

export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { meetingId } = await context.params;
    const existing = await prisma.workspaceMeeting.findUnique({
      where: {
        id: meetingId
      },
      select: {
        id: true,
        workspaceId: true,
        title: true,
        cancelledAt: true
      }
    });

    if (!existing) {
      throw new ApiError(404, "Meeting not found.");
    }

    await requireWorkspaceAdminAccess(user.id, existing.workspaceId, "Only admins can cancel workspace meetings.");

    if (existing.cancelledAt) {
      throw new ApiError(409, "This meeting has already been cancelled.");
    }

    const meeting = await prisma.workspaceMeeting.update({
      where: {
        id: meetingId
      },
      data: {
        cancelledAt: new Date()
      },
      include: meetingInclude
    });

    await logActivity({
      userId: user.id,
      workspaceId: existing.workspaceId,
      action: activityActions.meetingCancelled,
      targetId: meeting.id,
      metadata: {
        title: meeting.title
      }
    });

    return ok({
      meeting: {
        id: meeting.id,
        workspaceId: meeting.workspaceId,
        title: meeting.title,
        description: meeting.description,
        passcode: meeting.passcode,
        startsAt: meeting.startsAt.toISOString(),
        endsAt: meeting.endsAt.toISOString(),
        cancelledAt: meeting.cancelledAt?.toISOString() ?? null,
        createdAt: meeting.createdAt.toISOString(),
        updatedAt: meeting.updatedAt.toISOString(),
        createdBy: meeting.createdBy,
        workspace: meeting.workspace,
        inviteUrl: meetingInviteUrl(meeting.id, new URL(request.url).origin)
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
