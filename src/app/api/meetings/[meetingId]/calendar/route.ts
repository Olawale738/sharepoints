import { ApiError, handleRouteError, requireUser } from "@/lib/api";
import { meetingInviteUrl } from "@/lib/meetings";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership } from "@/lib/rbac";

type RouteContext = {
  params: Promise<{ meetingId: string }>;
};

function icsDate(value: Date) {
  return value.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { meetingId } = await context.params;
    const meeting = await prisma.workspaceMeeting.findUnique({
      where: {
        id: meetingId
      },
      include: {
        workspace: {
          select: {
            name: true
          }
        },
        createdBy: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    if (!meeting) {
      throw new ApiError(404, "Meeting not found.");
    }

    await requireWorkspaceMembership(user.id, meeting.workspaceId);

    if (meeting.cancelledAt) {
      throw new ApiError(409, "Cancelled meetings cannot be added to calendar.");
    }

    const origin = new URL(request.url).origin;
    const joinUrl = meetingInviteUrl(meeting.id, origin);
    const description = [
      meeting.description ?? "",
      "",
      `Join LETW meeting: ${joinUrl}`,
      `Passcode: ${meeting.passcode}`
    ]
      .join("\n")
      .trim();
    const organizer = meeting.createdBy.email
      ? `ORGANIZER;CN=${escapeIcs(meeting.createdBy.name ?? meeting.createdBy.email)}:mailto:${meeting.createdBy.email}`
      : null;
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//LETW//Collaboration//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${meeting.id}@sharepoints.letw.org`,
      `DTSTAMP:${icsDate(new Date())}`,
      `DTSTART:${icsDate(meeting.startsAt)}`,
      `DTEND:${icsDate(meeting.endsAt)}`,
      `SUMMARY:${escapeIcs(meeting.title)}`,
      `DESCRIPTION:${escapeIcs(description)}`,
      `LOCATION:${escapeIcs("LETW video meeting")}`,
      `URL:${joinUrl}`,
      organizer,
      "END:VEVENT",
      "END:VCALENDAR"
    ].filter((line): line is string => Boolean(line));

    return new Response(`${lines.join("\r\n")}\r\n`, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${meeting.title.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80) || "letw-meeting"}.ics"`
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
