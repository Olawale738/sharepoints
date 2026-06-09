import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarClock, CalendarPlus, KeyRound, UsersRound } from "lucide-react";

import { auth } from "@/auth";
import { CopyTextButton } from "@/components/dashboard/copy-text-button";
import { MeetingPasscodeForm } from "@/components/dashboard/meeting-passcode-form";
import { VideoMeetingRoom } from "@/components/dashboard/video-meeting-room";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership } from "@/lib/rbac";
import { formatDate } from "@/lib/utils";

type MeetingPageProps = {
  params: Promise<{ meetingId: string }>;
  searchParams: Promise<{ passcode?: string }>;
};

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(value);
}

export default async function MeetingPage({ params, searchParams }: MeetingPageProps) {
  const { meetingId } = await params;
  const { passcode } = await searchParams;
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/dashboard/meetings/${meetingId}`)}`);
  }

  const meeting = await prisma.workspaceMeeting.findUnique({
    where: {
      id: meetingId
    },
    include: {
      workspace: {
        select: {
          id: true,
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
    notFound();
  }

  await requireWorkspaceMembership(session.user.id, meeting.workspaceId);

  const displayName = session.user.name ?? session.user.email ?? "LETW member";
  const hasValidPasscode = passcode?.trim() === meeting.passcode;
  const isCancelled = Boolean(meeting.cancelledAt);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge className={isCancelled ? "bg-clay/10 text-clay" : "bg-mint"}>{isCancelled ? "Cancelled" : "Video meeting"}</Badge>
              <span className="inline-flex items-center gap-1 text-xs text-ink/55">
                <UsersRound className="h-3.5 w-3.5" />
                {meeting.workspace.name}
              </span>
            </div>
            <h1 className="text-3xl font-semibold text-ink">{meeting.title}</h1>
            {meeting.description ? <p className="mt-2 max-w-3xl whitespace-pre-wrap text-sm text-ink/60">{meeting.description}</p> : null}
            <p className="mt-3 inline-flex items-center gap-2 text-sm text-ink/55">
              <CalendarClock className="h-4 w-4 text-moss" />
              {formatDateTime(meeting.startsAt)} - {formatDateTime(meeting.endsAt)}
            </p>
          </div>
          <div className="rounded-md border border-ink/10 bg-paper px-3 py-2 text-sm text-ink/70">
            <p className="mb-1 flex items-center gap-2 font-medium text-ink">
              <KeyRound className="h-4 w-4 text-moss" />
              Passcode
            </p>
            <div className="flex items-center gap-2">
              <code className="rounded bg-white px-2 py-1 text-xs">{meeting.passcode}</code>
              <CopyTextButton value={meeting.passcode} />
            </div>
          </div>
        </div>
      </section>

      {isCancelled ? (
        <div className="rounded-lg border border-clay/20 bg-clay/10 p-5 text-sm text-clay">
          This meeting was cancelled on {formatDate(meeting.cancelledAt as Date)}.
        </div>
      ) : hasValidPasscode ? (
        <VideoMeetingRoom displayName={displayName} roomName={meeting.roomName} title={meeting.title} />
      ) : (
        <MeetingPasscodeForm
          title={meeting.title}
          error={passcode ? "That passcode is not correct." : undefined}
        />
      )}

      <div className="flex flex-wrap gap-3">
        {!isCancelled ? (
          <a
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-ink/10 bg-white px-3 text-sm font-medium text-ink transition hover:bg-mint/50"
            href={`/api/meetings/${meeting.id}/calendar`}
          >
            <CalendarPlus className="h-4 w-4" />
            Add to calendar
          </a>
        ) : null}
        <Link className="inline-flex h-9 items-center text-sm font-medium text-moss hover:underline" href={`/dashboard/workspaces/${meeting.workspaceId}`}>
          Back to workspace
        </Link>
      </div>
    </div>
  );
}
