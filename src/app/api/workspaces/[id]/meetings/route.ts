import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { canApproveWorkspaceContent, createApprovalRequestIfNeeded, initialApprovalStatus } from "@/lib/governance";
import { createMeetingPasscode, createMeetingRoomName, meetingInclude, serializeMeeting } from "@/lib/meetings";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership, requireWorkspacePermission } from "@/lib/rbac";
import { createWorkspaceMeetingSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspaceMembership(user.id, id);
    const canApprove = await canApproveWorkspaceContent(user.id, id);

    const meetings = await prisma.workspaceMeeting.findMany({
      where: canApprove
        ? {
            workspaceId: id
          }
        : {
            workspaceId: id,
            OR: [{ approvalStatus: "APPROVED" }, { createdById: user.id }]
          },
      include: meetingInclude,
      orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
      take: 100
    });

    const origin = new URL(request.url).origin;

    return ok({
      meetings: meetings.map((meeting) => serializeMeeting(meeting, user.id, origin))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspacePermission(user.id, id, "canScheduleMeetings");

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

    const approvalStatus = await initialApprovalStatus(user.id, id);
    const meeting = await prisma.workspaceMeeting.create({
      data: {
        workspaceId: id,
        createdById: user.id,
        title: parsed.data.title,
        description: parsed.data.description || null,
        agenda: parsed.data.agenda || null,
        recordingUrl: parsed.data.recordingUrl || null,
        autoRecord: parsed.data.autoRecord ?? false,
        recordingMode: parsed.data.recordingMode ?? "file",
        startsAt,
        endsAt,
        roomName: createMeetingRoomName(workspace.name),
        passcode: createMeetingPasscode(),
        approvalStatus,
        approvedById: approvalStatus === "APPROVED" ? user.id : null,
        approvedAt: approvalStatus === "APPROVED" ? new Date() : null
      },
      include: meetingInclude
    });
    await createApprovalRequestIfNeeded({
      status: approvalStatus,
      workspaceId: id,
      requesterId: user.id,
      targetType: "MEETING",
      targetId: meeting.id,
      title: meeting.title
    });

    await logActivity({
      userId: user.id,
      workspaceId: id,
      action: activityActions.meetingScheduled,
      targetId: meeting.id,
      metadata: {
        title: meeting.title,
        startsAt: meeting.startsAt.toISOString(),
        approvalStatus
      }
    });

    return ok({ meeting: serializeMeeting(meeting, user.id, new URL(request.url).origin) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
