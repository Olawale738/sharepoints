"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, Phone, Radio, ShieldCheck, Video } from "lucide-react";

type JitsiApi = {
  addListener: (event: string, listener: (payload?: Record<string, unknown>) => void) => void;
  dispose: () => void;
  executeCommand: (command: string, payload?: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    JitsiMeetExternalAPI?: new (domain: string, options: Record<string, unknown>) => JitsiApi;
  }
}

type VideoMeetingRoomProps = {
  roomName: string;
  displayName: string;
  title: string;
  meetingId: string;
  autoRecord: boolean;
  recordingMode: string;
  meetingType: "AUDIO" | "VIDEO";
};

function configuredDomain() {
  return (process.env.NEXT_PUBLIC_JITSI_DOMAIN || "meet.jit.si").replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function configuredRoomName(roomName: string) {
  const appId = process.env.NEXT_PUBLIC_JITSI_APP_ID?.trim();
  return appId ? `${appId}/${roomName}` : roomName;
}

function scriptUrl(domain: string) {
  return `https://${domain}/external_api.js`;
}

function meetingUrl(roomName: string, meetingType: "AUDIO" | "VIDEO") {
  const domain = configuredDomain();
  const baseUrl = `https://${domain}/${configuredRoomName(roomName)}`;

  if (meetingType === "AUDIO") {
    return `${baseUrl}#config.startAudioOnly=true&config.startWithVideoMuted=true`;
  }

  return baseUrl;
}

function loadJitsiScript(domain: string) {
  return new Promise<void>((resolve, reject) => {
    if (window.JitsiMeetExternalAPI) {
      resolve();
      return;
    }

    const existingScript = document.querySelector<HTMLScriptElement>(`script[data-letw-jitsi="${domain}"]`);

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(), { once: true });
      existingScript.addEventListener("error", () => reject(new Error("Jitsi API script failed to load.")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.src = scriptUrl(domain);
    script.dataset.letwJitsi = domain;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Jitsi API script failed to load."));
    document.head.appendChild(script);
  });
}

export function VideoMeetingRoom({
  roomName,
  displayName,
  title,
  meetingId,
  autoRecord,
  recordingMode,
  meetingType
}: VideoMeetingRoomProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<JitsiApi | null>(null);
  const attemptedAutoRecordRef = useRef(false);
  const attendanceIdRef = useRef("");
  const isAudioCall = meetingType === "AUDIO";
  const [status, setStatus] = useState(`Connecting to LETW ${isAudioCall ? "audio call" : "video room"}...`);
  const [recordingMessage, setRecordingMessage] = useState(
    autoRecord
      ? "Auto recording is armed. It starts when the meeting moderator joins and the Jitsi server supports recording."
      : ""
  );

  useEffect(() => {
    let disposed = false;
    const domain = configuredDomain();

    async function setupMeeting() {
      try {
        await loadJitsiScript(domain);

        if (disposed || !containerRef.current || !window.JitsiMeetExternalAPI) {
          return;
        }

        containerRef.current.innerHTML = "";
        const api = new window.JitsiMeetExternalAPI(domain, {
          roomName: configuredRoomName(roomName),
          parentNode: containerRef.current,
          width: "100%",
          height: "100%",
          userInfo: {
            displayName
          },
          configOverwrite: {
            disableDeepLinking: true,
            prejoinPageEnabled: true,
            startWithAudioMuted: true,
            startWithVideoMuted: isAudioCall,
            startAudioOnly: isAudioCall,
            ...(isAudioCall
              ? {
                  toolbarButtons: [
                    "microphone",
                    "desktop",
                    "chat",
                    "participants-pane",
                    "raisehand",
                    "tileview",
                    "fullscreen",
                    "settings",
                    "hangup"
                  ]
                }
              : {})
          },
          interfaceConfigOverwrite: {
            SHOW_JITSI_WATERMARK: false
          }
        });

        apiRef.current = api;
        setStatus(isAudioCall ? "Audio call ready." : "Video room ready.");

        api.addListener("videoConferenceJoined", () => {
          setStatus(isAudioCall ? "Joined audio call." : "Joined video meeting.");
          void fetch(`/api/meetings/${meetingId}/attendance`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "JOIN" })
          })
            .then((response) => response.json())
            .then((data: { attendance?: { id?: string } }) => {
              attendanceIdRef.current = data.attendance?.id ?? "";
            })
            .catch(() => undefined);

          if (!autoRecord || attemptedAutoRecordRef.current) {
            return;
          }

          attemptedAutoRecordRef.current = true;
          setRecordingMessage("Sending automatic recording request to Jitsi...");

          window.setTimeout(() => {
            try {
              api.executeCommand("startRecording", {
                mode: recordingMode || "file",
                shouldShare: true,
                extraMetadata: {
                  source: "LETW",
                  meetingId,
                  title
                }
              });
              setRecordingMessage("Auto recording request sent. Jitsi will start it if this user is moderator and recording is enabled.");
              void fetch(`/api/meetings/${meetingId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  recordingStatus: "requested",
                  recordingMode: recordingMode || "file"
                })
              }).catch(() => undefined);
            } catch (error) {
              const message = error instanceof Error ? error.message : "Recording request failed.";
              setRecordingMessage(message);
              void fetch(`/api/meetings/${meetingId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  recordingStatus: "failed",
                  recordingError: message
                })
              }).catch(() => undefined);
            }
          }, 2500);
        });

        api.addListener("videoConferenceLeft", () => {
          const attendanceId = attendanceIdRef.current;
          if (!attendanceId) return;
          void fetch(`/api/meetings/${meetingId}/attendance`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "LEAVE", attendanceId })
          }).catch(() => undefined);
          attendanceIdRef.current = "";
        });

        api.addListener("recordingStatusChanged", (payload) => {
          const isRecording = Boolean(payload?.on);
          const error = typeof payload?.error === "string" ? payload.error : "";
          const mode = typeof payload?.mode === "string" ? payload.mode : recordingMode || "file";
          const nextStatus = error ? "failed" : isRecording ? "recording" : "stopped";

          setRecordingMessage(
            error
              ? `Recording failed: ${error}`
              : isRecording
                ? `Recording started in ${mode} mode.`
                : "Recording stopped."
          );
          void fetch(`/api/meetings/${meetingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recordingStatus: nextStatus,
              recordingMode: mode,
              recordingError: error
            })
          }).catch(() => undefined);
        });

        api.addListener("recordingLinkAvailable", (payload) => {
          const link = typeof payload?.link === "string" ? payload.link : "";

          if (!link) {
            return;
          }

          setRecordingMessage("Recording link received from Jitsi.");
          void fetch(`/api/meetings/${meetingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              recordingUrl: link,
              recordingStatus: "available"
            })
          }).catch(() => undefined);
        });
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Video room failed to load.");
      }
    }

    void setupMeeting();

    return () => {
      disposed = true;
      if (attendanceIdRef.current) {
        void fetch(`/api/meetings/${meetingId}/attendance`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "LEAVE", attendanceId: attendanceIdRef.current }),
          keepalive: true
        }).catch(() => undefined);
      }
      apiRef.current?.dispose();
      apiRef.current = null;
    };
  }, [autoRecord, displayName, isAudioCall, meetingId, recordingMode, roomName, title]);

  const fullScreenUrl = meetingUrl(roomName, meetingType);
  const CallIcon = isAudioCall ? Phone : Video;

  return (
    <section className="overflow-hidden rounded-lg border border-ink/10 bg-white shadow-soft">
      <div className="flex flex-col gap-3 border-b border-ink/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-moss">
            <ShieldCheck className="h-4 w-4" />
            LETW protected {isAudioCall ? "audio call" : "video meeting"}
          </p>
          <h1 className="mt-1 text-xl font-semibold text-ink">{title}</h1>
        </div>
        <a
          className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-ink/10 bg-white px-3 text-sm font-medium text-ink transition hover:bg-mint/50"
          href={fullScreenUrl}
          rel="noreferrer"
          target="_blank"
        >
          <ExternalLink className="h-4 w-4" />
          Open full screen
        </a>
      </div>
      <div className="bg-paper p-3">
        <div className="mb-3 grid gap-2 md:grid-cols-2">
          <div className="flex items-center gap-2 rounded-md bg-mint/70 px-3 py-2 text-sm text-ink">
            <CallIcon className="h-4 w-4 text-moss" />
            {status.startsWith("Connecting") ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {status}
          </div>
          {recordingMessage ? (
            <div className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm text-ink/70">
              <Radio className="h-4 w-4 text-clay" />
              {recordingMessage}
            </div>
          ) : null}
        </div>
        <div
          ref={containerRef}
          className="h-[72vh] min-h-[34rem] w-full overflow-hidden rounded-md border border-ink/10 bg-ink"
        />
      </div>
    </section>
  );
}
