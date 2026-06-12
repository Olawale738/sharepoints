import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership, requireWorkspacePermission } from "@/lib/rbac";
import { analyzeTranscript, transcribeAudio } from "@/lib/transcription";

type RouteContext = { params: Promise<{ meetingId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { meetingId } = await context.params;
    const meeting = await prisma.workspaceMeeting.findUnique({ where: { id: meetingId } });
    if (!meeting) throw new ApiError(404, "Meeting not found.");
    await requireWorkspaceMembership(user.id, meeting.workspaceId);
    const [attendance, actionItems] = await Promise.all([
      prisma.meetingAttendance.findMany({ where: { meetingId }, orderBy: { joinedAt: "asc" } }),
      prisma.meetingActionItem.findMany({ where: { meetingId }, orderBy: { createdAt: "asc" } })
    ]);
    return ok({ meeting, attendance, actionItems });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  let meetingId: string | null = null;
  try {
    const user = await requireUser();
    const params = await context.params;
    meetingId = params.meetingId;
    const currentMeetingId = params.meetingId;
    const meeting = await prisma.workspaceMeeting.findUnique({ where: { id: currentMeetingId } });
    if (!meeting) throw new ApiError(404, "Meeting not found.");
    await requireWorkspacePermission(user.id, meeting.workspaceId, "canScheduleMeetings");
    await prisma.workspaceMeeting.update({
      where: { id: currentMeetingId },
      data: { transcriptStatus: "PROCESSING" }
    });

    let transcript = "";
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await request.formData();
      const audio = form.get("audio");
      if (!(audio instanceof File)) throw new ApiError(422, "Meeting audio is required.");
      transcript = await transcribeAudio(audio);
    } else {
      const body = (await request.json()) as { transcript?: string };
      transcript = body.transcript?.trim() ?? "";
      if (!transcript) throw new ApiError(422, "A transcript or audio recording is required.");
    }

    const analysis = analyzeTranscript(transcript);
    await prisma.$transaction([
      prisma.workspaceMeeting.update({
        where: { id: currentMeetingId },
        data: {
          transcript,
          transcriptSummary: analysis.summary,
          transcriptStatus: "COMPLETED",
          notes: meeting.notes || analysis.summary,
          actionItems: analysis.actionItems.join("\n")
        }
      }),
      prisma.meetingActionItem.deleteMany({ where: { meetingId: currentMeetingId } }),
      prisma.meetingActionItem.createMany({
        data: analysis.actionItems.map((title) => ({ meetingId: currentMeetingId, title }))
      })
    ]);
    return ok({ transcript, summary: analysis.summary, actionItems: analysis.actionItems });
  } catch (error) {
    if (meetingId) {
      await prisma.workspaceMeeting
        .update({
          where: { id: meetingId },
          data: { transcriptStatus: "FAILED" }
        })
        .catch(() => undefined);
    }
    return handleRouteError(error);
  }
}
