"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";
import { Loader2, Mic, RotateCcw, Send, SmilePlus, Square, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";

const quickEmojis = [
  "\u{1F44D}",
  "\u{1F64F}",
  "\u2705",
  "\u2764\uFE0F",
  "\u{1F602}",
  "\u{1F525}",
  "\u{1F44F}",
  "\u{1F389}",
  "\u{1F64C}",
  "\u{1F60A}"
];
const maxVoiceDurationMs = 5 * 60 * 1000;

type ChatComposerProps = {
  value: string;
  placeholder: string;
  disabled?: boolean;
  isSending?: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
  onSendVoiceNote?: (voiceNote: Blob, durationMs: number) => Promise<boolean>;
};

function formatDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function preferredMimeType() {
  if (typeof MediaRecorder === "undefined") {
    return "";
  }

  return (
    ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg;codecs=opus"].find((mimeType) =>
      MediaRecorder.isTypeSupported(mimeType)
    ) ?? ""
  );
}

export function ChatComposer({
  value,
  placeholder,
  disabled,
  isSending,
  onChange,
  onSend,
  onSendVoiceNote
}: ChatComposerProps) {
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const cancelledRef = useRef(false);
  const voiceUrlRef = useRef("");
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "preview">("idle");
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [voiceBlob, setVoiceBlob] = useState<Blob | null>(null);
  const [voiceUrl, setVoiceUrl] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const [isSendingVoice, setIsSendingVoice] = useState(false);

  useEffect(() => {
    voiceUrlRef.current = voiceUrl;
  }, [voiceUrl]);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;

      if (recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }

      if (voiceUrlRef.current) {
        URL.revokeObjectURL(voiceUrlRef.current);
      }

      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (recordingState !== "recording") {
      return;
    }

    const interval = window.setInterval(() => {
      const elapsed = Date.now() - startTimeRef.current;
      setRecordingDurationMs(elapsed);

      if (elapsed >= maxVoiceDurationMs && recorderRef.current?.state === "recording") {
        recorderRef.current.stop();
      }
    }, 250);

    return () => window.clearInterval(interval);
  }, [recordingState]);

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  }

  function insertEmoji(emoji: string) {
    onChange(`${value}${emoji}`);
  }

  function releaseStream() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  function discardVoiceNote() {
    cancelledRef.current = true;

    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }

    releaseStream();

    if (voiceUrlRef.current) {
      URL.revokeObjectURL(voiceUrlRef.current);
    }

    voiceUrlRef.current = "";
    setVoiceUrl("");
    setVoiceBlob(null);
    setRecordingDurationMs(0);
    setRecordingState("idle");
    setVoiceError("");
  }

  async function startRecording() {
    if (disabled || !onSendVoiceNote) {
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setVoiceError("Voice recording is not supported by this browser.");
      return;
    }

    setVoiceError("");
    cancelledRef.current = false;
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      const mimeType = preferredMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      streamRef.current = stream;
      recorderRef.current = recorder;
      startTimeRef.current = Date.now();
      setRecordingDurationMs(0);
      setRecordingState("recording");

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      });
      recorder.addEventListener("stop", () => {
        releaseStream();

        if (cancelledRef.current) {
          cancelledRef.current = false;
          chunksRef.current = [];
          return;
        }

        const durationMs = Math.min(Date.now() - startTimeRef.current, maxVoiceDurationMs);
        const blob = new Blob(chunksRef.current, {
          type: recorder.mimeType || chunksRef.current[0]?.type || "audio/webm"
        });

        chunksRef.current = [];

        if (!blob.size || durationMs < 500) {
          setVoiceError("The recording was too short. Try again.");
          setRecordingState("idle");
          return;
        }

        const previewUrl = URL.createObjectURL(blob);
        voiceUrlRef.current = previewUrl;
        setVoiceBlob(blob);
        setVoiceUrl(previewUrl);
        setRecordingDurationMs(durationMs);
        setRecordingState("preview");
      });
      recorder.start(250);
    } catch {
      releaseStream();
      setRecordingState("idle");
      setVoiceError("Microphone access was denied or unavailable.");
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === "recording") {
      recorderRef.current.stop();
    }
  }

  async function sendVoiceNote() {
    if (!voiceBlob || !onSendVoiceNote) {
      return;
    }

    setIsSendingVoice(true);
    const sent = await onSendVoiceNote(voiceBlob, recordingDurationMs);
    setIsSendingVoice(false);

    if (sent) {
      discardVoiceNote();
    }
  }

  if (recordingState === "recording") {
    return (
      <div className="rounded-lg border border-ink/10 bg-white p-2 shadow-soft">
        <div className="flex min-h-12 items-center gap-3">
          <button
            aria-label="Cancel voice recording"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-clay transition hover:bg-clay/10"
            type="button"
            onClick={discardVoiceNote}
          >
            <X className="h-5 w-5" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-md bg-paper px-3 py-2">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-clay" />
            <span className="font-mono text-sm font-semibold text-ink">{formatDuration(recordingDurationMs)}</span>
            <span className="truncate text-sm text-ink/55">Recording voice note</span>
          </div>
          <button
            aria-label="Stop voice recording"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-moss text-white transition hover:bg-[#185747]"
            type="button"
            onClick={stopRecording}
          >
            <Square className="h-4 w-4 fill-current" />
          </button>
        </div>
      </div>
    );
  }

  if (recordingState === "preview" && voiceUrl) {
    return (
      <div className="rounded-lg border border-ink/10 bg-white p-2 shadow-soft">
        <div className="flex flex-wrap items-center gap-2">
          <button
            aria-label="Discard voice note"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-clay transition hover:bg-clay/10"
            disabled={isSendingVoice}
            type="button"
            onClick={discardVoiceNote}
          >
            <Trash2 className="h-4 w-4" />
          </button>
          <audio className="h-10 min-w-0 flex-1" controls preload="metadata" src={voiceUrl} />
          <span className="text-xs text-ink/50">{formatDuration(recordingDurationMs)}</span>
          <button
            aria-label="Record again"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink/65 transition hover:bg-mint"
            disabled={isSendingVoice}
            type="button"
            onClick={() => {
              discardVoiceNote();
              window.setTimeout(startRecording, 0);
            }}
          >
            <RotateCcw className="h-4 w-4" />
          </button>
          <Button className="h-10 shrink-0 px-3" disabled={isSendingVoice} onClick={sendVoiceNote}>
            {isSendingVoice ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-ink/10 bg-white p-2 shadow-soft">
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <SmilePlus className="mr-1 h-4 w-4 text-moss" />
        {quickEmojis.map((emoji) => (
          <button
            key={emoji}
            aria-label={`Insert ${emoji}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-base transition hover:bg-mint disabled:pointer-events-none disabled:opacity-50"
            disabled={disabled}
            type="button"
            onClick={() => insertEmoji(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <textarea
          className="min-h-11 flex-1 resize-none rounded-md border border-ink/10 bg-paper px-3 py-2 text-sm outline-none transition placeholder:text-ink/40 focus:border-moss disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
          maxLength={4000}
          placeholder={placeholder}
          rows={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        {onSendVoiceNote ? (
          <button
            aria-label="Record voice note"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-ink/10 bg-white text-moss transition hover:bg-mint disabled:pointer-events-none disabled:opacity-50"
            disabled={disabled || isSending}
            title="Record voice note"
            type="button"
            onClick={startRecording}
          >
            <Mic className="h-5 w-5" />
          </button>
        ) : null}
        <Button className="h-11 shrink-0" disabled={disabled || isSending || !value.trim()} onClick={onSend}>
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send
        </Button>
      </div>
      {voiceError ? <p className="mt-2 text-xs text-clay">{voiceError}</p> : null}
    </div>
  );
}
