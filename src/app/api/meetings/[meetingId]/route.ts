import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { meetingInclude, serializeMeeting } from "@/lib/meetings";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceAdminAccess } from "@/lib/rbac";
import { updateMeetingDetailsSchema } from "@/lib/validators";

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

    await requireWorkspaceAdminAccess(user.id, existing.workspaceId, "Only admins can manage workspace meetings.");

    if (existing.cancelledAt) {
      await prisma.workspaceMeeting.delete({
        where: {
          id: meetingId
        }
      });

      await logActivity({
        userId: user.id,
        workspaceId: existing.workspaceId,
        action: activityActions.meetingCleared,
        targetId: existing.id,
        metadata: {
          title: existing.title
        }
      });

      return ok({
        cleared: true,
        meetingId
      });
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
      meeting: serializeMeeting(meeting, user.id, new URL(request.url).origin)
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { meetingId } = await context.params;
    const existing = await prisma.workspaceMeeting.findUnique({
      where: {
        id: meetingId
      },
      select: {
        id: true,
        workspaceId: true
      }
    });

    if (!existing) {
      throw new ApiError(404, "Meeting not found.");
    }

    await requireWorkspaceAdminAccess(user.id, existing.workspaceId, "Only admins can update meeting notes.");

    const body = await request.json();
    const parsed = updateMeetingDetailsSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid meeting details.");
    }

    const meeting = await prisma.workspaceMeeting.update({
      where: {
        id: meetingId
      },
      data: {
        agenda: parsed.data.agenda === undefined ? undefined : parsed.data.agenda || null,
        notes: parsed.data.notes === undefined ? undefined : parsed.data.notes || null,
        actionItems: parsed.data.actionItems === undefined ? undefined : parsed.data.actionItems || null,
        recordingUrl: parsed.data.recordingUrl === undefined ? undefined : parsed.data.recordingUrl || null
      },
      include: meetingInclude
    });

    return ok({
      meeting: serializeMeeting(meeting, user.id, new URL(request.url).origin)
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
