import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { createMeetingPasscode, createMeetingRoomName, meetingInclude, meetingInviteUrl } from "@/lib/meetings";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceAdminAccess, requireWorkspaceMembership } from "@/lib/rbac";
import { createWorkspaceMeetingSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function serializeMeeting(meeting: {
  id: string;
  workspaceId: string;
  title: string;
  description: string | null;
  startsAt: Date;
  endsAt: Date;
  passcode: string;
  cancelledAt: Date | null;
  createdAt: Date;
  createdBy: { name?: string | null; email?: string | null };
  workspace?: { id: string; name: string };
}, origin?: string) {
  return {
    id: meeting.id,
    workspaceId: meeting.workspaceId,
    title: meeting.title,
    description: meeting.description,
    startsAt: meeting.startsAt.toISOString(),
    endsAt: meeting.endsAt.toISOString(),
    passcode: meeting.passcode,
    cancelledAt: meeting.cancelledAt?.toISOString() ?? null,
    createdAt: meeting.createdAt.toISOString(),
    createdBy: meeting.createdBy,
    workspace: meeting.workspace,
    inviteUrl: meetingInviteUrl(meeting.id, origin)
  };
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspaceMembership(user.id, id);

    const meetings = await prisma.workspaceMeeting.findMany({
      where: {
        workspaceId: id
      },
      include: meetingInclude,
      orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
      take: 100
    });

    const origin = new URL(request.url).origin;

    return ok({
      meetings: meetings.map((meeting) => serializeMeeting(meeting, origin))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspaceAdminAccess(user.id, id, "Only admins can schedule workspace video meetings.");

    const body = await request.json();
    const parsed = createWorkspaceMeetingSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid meeting.");
    }

    const startsAt = new Date(parsed.data.startsAt);
    const endsAt = new Date(parsed.data.endsAt);
    const now = new Date();

    if (startsAt.getTime() < now.getTime() - 5 * 60 * 1000) {
      throw new ApiError(422, "Meeting start time must be in the future.");
    }

    if (endsAt.getTime() - startsAt.getTime() > 8 * 60 * 60 * 1000) {
      throw new ApiError(422, "Meetings cannot be longer than 8 hours.");
    }

    const workspace = await prisma.workspace.findUnique({
      where: {
        id
      },
      select: {
        name: true
      }
    });

    if (!workspace) {
      throw new ApiError(404, "Workspace not found.");
    }

    const meeting = await prisma.workspaceMeeting.create({
      data: {
        workspaceId: id,
        createdById: user.id,
        title: parsed.data.title,
        description: parsed.data.description || null,
        startsAt,
        endsAt,
        roomName: createMeetingRoomName(workspace.name),
        passcode: createMeetingPasscode()
      },
      include: meetingInclude
    });

    await logActivity({
      userId: user.id,
      workspaceId: id,
      action: activityActions.meetingScheduled,
      targetId: meeting.id,
      metadata: {
        title: meeting.title,
        startsAt: meeting.startsAt.toISOString()
      }
    });

    return ok({ meeting: serializeMeeting(meeting, new URL(request.url).origin) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
