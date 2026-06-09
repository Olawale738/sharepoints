"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { CalendarPlus, Check, CalendarClock, Copy, HelpCircle, KeyRound, Loader2, Plus, Video, X, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Meeting = {
  id: string;
  workspaceId: string;
  title: string;
  description?: string | null;
  startsAt: string;
  endsAt: string;
  passcode: string;
  cancelledAt?: string | null;
  inviteUrl: string;
  currentUserResponse?: MeetingResponseStatus | null;
  responseCounts: Record<MeetingResponseStatus, number>;
  createdBy: {
    name?: string | null;
    email?: string | null;
  };
};

type MeetingResponseStatus = "YES" | "MAYBE" | "NO";

type MeetingsPanelProps = {
  workspaceId: string;
  meetings: Meeting[];
  canManage: boolean;
};

function localDateTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

function dateTimeFallback(value: string) {
  return new Date(value).toISOString().slice(0, 16).replace("T", " ");
}

function DateTimeText({ value }: { value: string }) {
  const [text, setText] = useState(dateTimeFallback(value));

  useEffect(() => {
    setText(localDateTime(value));
  }, [value]);

  return <span suppressHydrationWarning>{text}</span>;
}

function meetingStatus(meeting: Meeting, now: number | null) {
  const startsAt = new Date(meeting.startsAt).getTime();
  const endsAt = new Date(meeting.endsAt).getTime();

  if (meeting.cancelledAt) {
    return { label: "Cancelled", className: "bg-clay/10 text-clay" };
  }

  if (now && now >= startsAt && now <= endsAt) {
    return { label: "Live now", className: "bg-moss text-white" };
  }

  if (now && now > endsAt) {
    return { label: "Ended", className: "bg-ink/10 text-ink/60" };
  }

  return { label: "Scheduled", className: "bg-mint text-ink" };
}

function toInviteText(meeting: Meeting) {
  return [
    `LETW video meeting: ${meeting.title}`,
    `Join link: ${meeting.inviteUrl}`,
    `Passcode: ${meeting.passcode}`,
    `Time: ${localDateTime(meeting.startsAt)}`
  ].join("\n");
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "true");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}

export function MeetingsPanel({ workspaceId, meetings: initialMeetings, canManage }: MeetingsPanelProps) {
  const [meetings, setMeetings] = useState(initialMeetings);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isScheduling, setIsScheduling] = useState(false);
  const [busyMeetingId, setBusyMeetingId] = useState("");
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);

    return () => window.clearInterval(interval);
  }, []);

  const sortedMeetings = useMemo(
    () =>
      [...meetings].sort((first, second) => {
        const firstCancelled = Boolean(first.cancelledAt);
        const secondCancelled = Boolean(second.cancelledAt);

        if (firstCancelled !== secondCancelled) {
          return firstCancelled ? 1 : -1;
        }

        return new Date(first.startsAt).getTime() - new Date(second.startsAt).getTime();
      }),
    [meetings]
  );

  async function scheduleMeeting(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("");
    setIsScheduling(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const startsAt = String(formData.get("startsAt"));
    const endsAt = String(formData.get("endsAt"));
    const response = await fetch(`/api/workspaces/${workspaceId}/meetings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: String(formData.get("title")),
        description: String(formData.get("description") ?? ""),
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString()
      })
    });
    setIsScheduling(false);

    const data = (await response.json().catch(() => null)) as { meeting?: Meeting; error?: string } | null;

    if (!response.ok || !data?.meeting) {
      setError(data?.error ?? "Meeting could not be scheduled.");
      return;
    }

    setMeetings((current) => [data.meeting as Meeting, ...current]);
    setStatus(`Meeting scheduled. Passcode: ${data.meeting.passcode}`);
    form.reset();
  }

  async function copyInvite(meeting: Meeting) {
    await copyText(toInviteText(meeting));
    setStatus(`Invite copied for ${meeting.title}.`);
  }

  async function cancelMeeting(meeting: Meeting) {
    if (!window.confirm(`Cancel ${meeting.title}?`)) {
      return;
    }

    setError("");
    setStatus("");
    setBusyMeetingId(meeting.id);
    const response = await fetch(`/api/meetings/${meeting.id}`, {
      method: "DELETE"
    });
    setBusyMeetingId("");

    const data = (await response.json().catch(() => null)) as { meeting?: Meeting; error?: string } | null;

    if (!response.ok || !data?.meeting) {
      setError(data?.error ?? "Meeting could not be cancelled.");
      return;
    }

    setMeetings((current) => current.map((item) => (item.id === meeting.id ? data.meeting as Meeting : item)));
    setStatus(`${meeting.title} was cancelled.`);
  }

  async function respondToMeeting(meeting: Meeting, responseStatus: MeetingResponseStatus) {
    setError("");
    setStatus("");
    setBusyMeetingId(meeting.id);
    const response = await fetch(`/api/meetings/${meeting.id}/rsvp`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: responseStatus })
    });
    setBusyMeetingId("");

    const data = (await response.json().catch(() => null)) as { meeting?: Meeting; error?: string } | null;

    if (!response.ok || !data?.meeting) {
      setError(data?.error ?? "Meeting response could not be saved.");
      return;
    }

    setMeetings((current) => current.map((item) => (item.id === meeting.id ? data.meeting as Meeting : item)));
    setStatus("Your meeting response was saved.");
  }

  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Video className="h-4 w-4 text-moss" />
          <h2 className="text-sm font-semibold">Video meetings</h2>
        </div>
        <Badge className="bg-mint">{meetings.filter((meeting) => !meeting.cancelledAt).length} active</Badge>
      </div>

      {canManage ? (
        <form className="mb-4 grid gap-3 rounded-md border border-ink/10 bg-paper p-3 lg:grid-cols-2" onSubmit={scheduleMeeting}>
          <Input className="lg:col-span-2" name="title" placeholder="Meeting title" required />
          <Input name="startsAt" type="datetime-local" required />
          <Input name="endsAt" type="datetime-local" required />
          <Textarea className="lg:col-span-2" name="description" placeholder="Agenda or meeting notes" rows={2} />
          <div className="lg:col-span-2">
            <Button type="submit" disabled={isScheduling}>
              {isScheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Schedule meeting
            </Button>
          </div>
        </form>
      ) : null}

      {error ? <p className="mb-3 rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
      {status ? <p className="mb-3 rounded-md bg-mint/70 px-3 py-2 text-sm text-ink">{status}</p> : null}

      <div className="space-y-3">
        {sortedMeetings.length === 0 ? <p className="text-sm text-ink/55">No video meetings scheduled yet.</p> : null}
        {sortedMeetings.map((meeting) => {
          const statusInfo = meetingStatus(meeting, now);
          const isCancelled = Boolean(meeting.cancelledAt);

          return (
            <article key={meeting.id} className="rounded-md border border-ink/10 bg-paper p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge className={statusInfo.className}>{statusInfo.label}</Badge>
                    <span className="inline-flex items-center gap-1 text-xs text-ink/55">
                      <CalendarClock className="h-3.5 w-3.5" />
                      <DateTimeText value={meeting.startsAt} />
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-ink">{meeting.title}</h3>
                  {meeting.description ? <p className="mt-1 whitespace-pre-wrap text-sm text-ink/65">{meeting.description}</p> : null}
                  <p className="mt-2 text-xs text-ink/50">
                    Ends <DateTimeText value={meeting.endsAt} /> - scheduled by {meeting.createdBy.name ?? meeting.createdBy.email}
                  </p>
                  <p className="mt-2 inline-flex items-center gap-2 rounded-md bg-white px-2 py-1 text-xs text-ink/70">
                    <KeyRound className="h-3.5 w-3.5 text-moss" />
                    Passcode <span className="font-semibold text-ink">{meeting.passcode}</span>
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <Badge className="bg-mint">
                      Going {meeting.responseCounts.YES}
                    </Badge>
                    <Badge className="bg-wheat">
                      Maybe {meeting.responseCounts.MAYBE}
                    </Badge>
                    <Badge className="bg-clay/10 text-clay">
                      No {meeting.responseCounts.NO}
                    </Badge>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  {isCancelled ? (
                    <Button className="h-9" variant="secondary" disabled>
                      <Video className="h-4 w-4" />
                      Join
                    </Button>
                  ) : (
                    <Link
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-moss px-4 text-sm font-medium text-white transition hover:bg-[#185747]"
                      href={meeting.inviteUrl}
                    >
                      <Video className="h-4 w-4" />
                      Join
                    </Link>
                  )}
                  <Button className="h-9" variant="secondary" onClick={() => copyInvite(meeting)}>
                    <Copy className="h-4 w-4" />
                    Copy invite
                  </Button>
                  {!isCancelled ? (
                    <a
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-ink/10 bg-white px-3 text-sm font-medium text-ink transition hover:bg-mint/50"
                      href={`/api/meetings/${meeting.id}/calendar`}
                    >
                      <CalendarPlus className="h-4 w-4" />
                      Calendar
                    </a>
                  ) : null}
                  {!isCancelled ? (
                    <div className="flex flex-wrap gap-1 rounded-md border border-ink/10 bg-white p-1">
                      <button
                        className={`inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-medium transition ${
                          meeting.currentUserResponse === "YES" ? "bg-moss text-white" : "text-ink hover:bg-mint/50"
                        }`}
                        disabled={busyMeetingId === meeting.id}
                        type="button"
                        onClick={() => respondToMeeting(meeting, "YES")}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Going
                      </button>
                      <button
                        className={`inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-medium transition ${
                          meeting.currentUserResponse === "MAYBE" ? "bg-wheat text-ink" : "text-ink hover:bg-mint/50"
                        }`}
                        disabled={busyMeetingId === meeting.id}
                        type="button"
                        onClick={() => respondToMeeting(meeting, "MAYBE")}
                      >
                        <HelpCircle className="h-3.5 w-3.5" />
                        Maybe
                      </button>
                      <button
                        className={`inline-flex h-8 items-center gap-1 rounded px-2 text-xs font-medium transition ${
                          meeting.currentUserResponse === "NO" ? "bg-clay text-white" : "text-ink hover:bg-clay/10"
                        }`}
                        disabled={busyMeetingId === meeting.id}
                        type="button"
                        onClick={() => respondToMeeting(meeting, "NO")}
                      >
                        <X className="h-3.5 w-3.5" />
                        No
                      </button>
                    </div>
                  ) : null}
                  {canManage && !isCancelled ? (
                    <Button
                      className="h-9"
                      variant="secondary"
                      disabled={busyMeetingId === meeting.id}
                      onClick={() => cancelMeeting(meeting)}
                    >
                      {busyMeetingId === meeting.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                      Cancel
                    </Button>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
