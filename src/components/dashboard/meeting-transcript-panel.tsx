"use client";

import { FormEvent, useState } from "react";
import { FileAudio, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function MeetingTranscriptPanel({
  meetingId,
  canManage,
  initialTranscript,
  initialSummary,
  attendance
}: {
  meetingId: string;
  canManage: boolean;
  initialTranscript?: string | null;
  initialSummary?: string | null;
  attendance: Array<{ id: string; displayName: string; joinedAt: string; leftAt?: string | null; durationSec?: number | null }>;
}) {
  const [transcript, setTranscript] = useState(initialTranscript ?? "");
  const [summary, setSummary] = useState(initialSummary ?? "");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProcessing(true);
    setError("");
    const form = event.currentTarget;
    const values = new FormData(form);
    const audio = values.get("audio");
    let request: RequestInit;
    if (audio instanceof File && audio.size) {
      const body = new FormData();
      body.append("audio", audio);
      request = { method: "POST", body };
    } else {
      request = {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: String(values.get("transcript") ?? "") })
      };
    }
    const response = await fetch(`/api/meetings/${meetingId}/transcript`, request);
    const data = (await response.json().catch(() => null)) as { transcript?: string; summary?: string; error?: string } | null;
    setProcessing(false);
    if (!response.ok) {
      setError(data?.error ?? "Transcript could not be processed.");
      return;
    }
    setTranscript(data?.transcript ?? "");
    setSummary(data?.summary ?? "");
  }

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-ink/10 bg-white p-4">
        <h2 className="flex items-center gap-2 font-semibold"><Sparkles className="h-4 w-4 text-moss" />Searchable transcript and summary</h2>
        {summary ? <p className="mt-3 whitespace-pre-wrap text-sm text-ink/65">{summary}</p> : <p className="mt-3 text-sm text-ink/50">No transcript summary yet.</p>}
        {transcript ? <details className="mt-4"><summary className="cursor-pointer text-sm font-medium text-moss">Open full transcript</summary><p className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap text-sm text-ink/60">{transcript}</p></details> : null}
        {canManage ? (
          <form className="mt-4 space-y-3 border-t border-ink/10 pt-4" onSubmit={submit}>
            <Textarea name="transcript" rows={5} placeholder="Paste a transcript, or upload the meeting audio below." defaultValue={transcript} />
            <label className="flex items-center gap-2 text-sm text-ink/60"><FileAudio className="h-4 w-4 text-moss" /><input name="audio" type="file" accept="audio/*" /></label>
            {error ? <p className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
            <Button type="submit" disabled={processing}>{processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}Process transcript</Button>
          </form>
        ) : null}
      </div>
      <div className="rounded-lg border border-ink/10 bg-white">
        <h2 className="border-b border-ink/10 px-4 py-3 font-semibold">Attendance</h2>
        <div className="divide-y divide-ink/10">
          {!attendance.length ? <p className="p-4 text-sm text-ink/50">Attendance is recorded when members join the embedded room.</p> : null}
          {attendance.map((item) => (
            <div key={item.id} className="px-4 py-3">
              <p className="text-sm font-medium">{item.displayName}</p>
              <p className="text-xs text-ink/50">Joined {new Date(item.joinedAt).toLocaleString()} · {item.durationSec ? `${Math.round(item.durationSec / 60)} minutes` : item.leftAt ? "under one minute" : "still present"}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
