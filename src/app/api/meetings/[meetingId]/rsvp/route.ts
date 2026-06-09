import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { meetingInclude, serializeMeeting } from "@/lib/meetings";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership } from "@/lib/rbac";
import { updateMeetingResponseSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ meetingId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { meetingId } = await context.params;
    const body = await request.json();
    const parsed = updateMeetingResponseSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid meeting response.");
    }

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

    await requireWorkspaceMembership(user.id, existing.workspaceId);

    if (existing.cancelledAt) {
      throw new ApiError(409, "You cannot RSVP to a cancelled meeting.");
    }

    await prisma.workspaceMeetingResponse.upsert({
      where: {
        meetingId_userId: {
          meetingId,
          userId: user.id
        }
      },
      update: {
        status: parsed.data.status
      },
      create: {
        meetingId,
        userId: user.id,
        status: parsed.data.status
      }
    });

    const meeting = await prisma.workspaceMeeting.findUnique({
      where: {
        id: meetingId
      },
      include: meetingInclude
    });

    if (!meeting) {
      throw new ApiError(404, "Meeting not found.");
    }

    await logActivity({
      userId: user.id,
      workspaceId: meeting.workspaceId,
      action: activityActions.meetingResponseUpdated,
      targetId: meeting.id,
      metadata: {
        title: meeting.title,
        status: parsed.data.status
      }
    });

    return ok({
      meeting: serializeMeeting(meeting, user.id, new URL(request.url).origin)
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
