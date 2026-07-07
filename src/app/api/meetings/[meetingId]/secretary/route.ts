import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { generateMeetingSecretaryPack, renderMeetingSecretaryNotes } from "@/lib/meeting-secretary";
import { prisma } from "@/lib/prisma";
import { requireWorkspacePermission } from "@/lib/rbac";

type RouteContext = {
  params: Promise<{ meetingId: string }>;
};

function parseDueDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function replaceSecretarySection(existing: string | null | undefined, section: string) {
  const start = "--- AI Meeting Secretary ---";
  const end = "--- End AI Meeting Secretary ---";
  const wrapped = `${start}\n${section}\n${end}`;
  if (!existing?.trim()) return wrapped;
  const startIndex = existing.indexOf(start);
  const endIndex = existing.indexOf(end);
  if (startIndex >= 0 && endIndex > startIndex) {
    return `${existing.slice(0, startIndex).trim()}\n\n${wrapped}\n\n${existing.slice(endIndex + end.length).trim()}`.trim();
  }
  return `${existing.trim()}\n\n${wrapped}`;
}

export async function POST(_request: Request, context: RouteContext) {
  try {
    const actor = await requireUser();
    const { meetingId } = await context.params;
    const meeting = await prisma.workspaceMeeting.findUnique({
      where: { id: meetingId },
      include: {
        workspace: { select: { id: true, name: true } },
        responses: {
          include: {
            user: { select: { id: true, name: true, email: true } }
          }
        }
      }
    });
    if (!meeting) {
      throw new ApiError(404, "Meeting not found.");
    }
    await requireWorkspacePermission(actor.id, meeting.workspaceId, "canScheduleMeetings");
    const attendance = await prisma.meetingAttendance.findMany({
      where: { meetingId },
      orderBy: { joinedAt: "asc" }
    });
    const pack = await generateMeetingSecretaryPack({
      title: meeting.title,
      workspaceName: meeting.workspace.name,
      description: meeting.description,
      agenda: meeting.agenda,
      notes: meeting.notes,
      actionItems: meeting.actionItems,
      transcript: meeting.transcript,
      startsAt: meeting.startsAt,
      endsAt: meeting.endsAt,
      attendance,
      rsvps: meeting.responses
    });
    const attendeeUsers = new Map(
      meeting.responses.map((response) => [
        [response.user.name, response.user.email].filter(Boolean).join(" ").toLowerCase(),
        response.user.id
      ])
    );
    const section = renderMeetingSecretaryNotes(pack);
    const actionItemsText = pack.actionItems
      .map((item) => `${item.title}${item.owner ? ` - ${item.owner}` : ""}${item.dueDate ? ` - due ${item.dueDate}` : ""}`)
      .join("\n");

    await prisma.$transaction(async (tx) => {
      await tx.workspaceMeeting.update({
        where: { id: meeting.id },
        data: {
          transcriptSummary: pack.summary,
          actionItems: actionItemsText || meeting.actionItems,
          notes: replaceSecretarySection(meeting.notes, section),
          transcriptStatus: meeting.transcript ? "COMPLETED" : meeting.transcriptStatus
        }
      });
      if (pack.actionItems.length) {
        await tx.meetingActionItem.deleteMany({ where: { meetingId: meeting.id } });
        await tx.meetingActionItem.createMany({
          data: pack.actionItems.map((item) => {
            const ownerKey = item.owner?.toLowerCase() ?? "";
            const assigneeId =
              attendeeUsers.get(ownerKey) ??
              Array.from(attendeeUsers.entries()).find(([key]) => ownerKey && key.includes(ownerKey))?.[1] ??
              null;
            return {
              meetingId: meeting.id,
              title: item.title,
              assigneeId,
              dueAt: parseDueDate(item.dueDate)
            };
          })
        });
      }
    });

    await logActivity({
      userId: actor.id,
      workspaceId: meeting.workspaceId,
      action: activityActions.meetingSecretaryGenerated,
      targetId: meeting.id,
      metadata: {
        generatedBy: pack.generatedBy,
        decisionCount: pack.decisions.length,
        actionItemCount: pack.actionItems.length
      }
    });

    return ok({ pack });
  } catch (error) {
    return handleRouteError(error);
  }
}
