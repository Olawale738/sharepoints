import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership } from "@/lib/rbac";

type RouteContext = { params: Promise<{ meetingId: string }> };
const attendanceSchema = z.object({
  action: z.enum(["JOIN", "LEAVE"]),
  attendanceId: z.string().cuid().optional()
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { meetingId } = await context.params;
    const meeting = await prisma.workspaceMeeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new ApiError(404, "Meeting not found.");
    await requireWorkspaceMembership(user.id, meeting.workspaceId);
    const parsed = attendanceSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, "Invalid attendance event.");

    if (parsed.data.action === "JOIN") {
      const attendance = await prisma.meetingAttendance.create({
        data: {
          meetingId,
          userId: user.id,
          displayName: user.name ?? user.email ?? "LETW member",
          joinedAt: new Date()
        }
      });
      return ok({ attendance }, { status: 201 });
    }

    if (!parsed.data.attendanceId) throw new ApiError(422, "Attendance ID is required.");
    const attendance = await prisma.meetingAttendance.findFirst({
      where: { id: parsed.data.attendanceId, meetingId, userId: user.id }
    });
    if (!attendance) throw new ApiError(404, "Attendance record not found.");
    const leftAt = new Date();
    const updated = await prisma.meetingAttendance.update({
      where: { id: attendance.id },
      data: {
        leftAt,
        durationSec: Math.max(0, Math.round((leftAt.getTime() - attendance.joinedAt.getTime()) / 1000))
      }
    });
    return ok({ attendance: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}
