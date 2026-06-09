"use client";

import { ExternalLink, ShieldCheck, Video } from "lucide-react";

type VideoMeetingRoomProps = {
  roomName: string;
  displayName: string;
  title: string;
};

function jitsiUrl(roomName: string, displayName: string) {
  const safeRoomName = encodeURIComponent(roomName);
  const safeDisplayName = encodeURIComponent(displayName);
  return `https://meet.jit.si/${safeRoomName}#config.disableDeepLinking=true&config.prejoinPageEnabled=true&config.startWithAudioMuted=true&userInfo.displayName="${safeDisplayName}"`;
}

export function VideoMeetingRoom({ roomName, displayName, title }: VideoMeetingRoomProps) {
  const src = jitsiUrl(roomName, displayName);

  return (
    <section className="overflow-hidden rounded-lg border border-ink/10 bg-white shadow-soft">
      <div className="flex flex-col gap-3 border-b border-ink/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-moss">
            <ShieldCheck className="h-4 w-4" />
            LETW protected meeting
          </p>
          <h1 className="mt-1 text-xl font-semibold text-ink">{title}</h1>
        </div>
        <a
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-ink/10 bg-white px-3 text-sm font-medium text-ink transition hover:bg-mint/50"
          href={src}
          rel="noreferrer"
          target="_blank"
        >
          <ExternalLink className="h-4 w-4" />
          Open full screen
        </a>
      </div>
      <div className="bg-paper p-3">
        <div className="mb-3 flex items-center gap-2 rounded-md bg-mint/70 px-3 py-2 text-sm text-ink">
          <Video className="h-4 w-4 text-moss" />
          Camera and microphone permissions may be requested by the meeting frame.
        </div>
        <iframe
          allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"
          className="h-[72vh] min-h-[34rem] w-full rounded-md border border-ink/10 bg-ink"
          referrerPolicy="no-referrer"
          src={src}
          title={title}
        />
      </div>
    </section>
  );
}
