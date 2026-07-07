"use client";

import { FormEvent, useState } from "react";
import { ClipboardList, FileAudio, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type SecretaryPack = {
  summary: string;
  decisions: string[];
  actionItems: Array<{ title: string; owner?: string | null; dueDate?: string | null }>;
  followUpDraft: string;
  risks: string[];
  attendanceInsight: string;
  generatedBy: "openai" | "fallback";
};

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
  const [secretary, setSecretary] = useState<SecretaryPack | null>(null);
  const [processing, setProcessing] = useState(false);
  const [secretaryBusy, setSecretaryBusy] = useState(false);
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
    setSecretary(null);
  }

  async function runSecretary() {
    setSecretaryBusy(true);
    setError("");
    const response = await fetch(`/api/meetings/${meetingId}/secretary`, { method: "POST" });
    const data = (await response.json().catch(() => null)) as { pack?: SecretaryPack; error?: string } | null;
    setSecretaryBusy(false);
    if (!response.ok || !data?.pack) {
      setError(data?.error ?? "AI meeting secretary could not run.");
      return;
    }
    setSecretary(data.pack);
    setSummary(data.pack.summary);
  }

  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border border-ink/10 bg-white p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <Sparkles className="h-4 w-4 text-moss" />
          Searchable transcript and summary
        </h2>
        {summary ? (
          <p className="mt-3 whitespace-pre-wrap text-sm text-ink/65">{summary}</p>
        ) : (
          <p className="mt-3 text-sm text-ink/50">No transcript summary yet.</p>
        )}
        {transcript ? (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-moss">Open full transcript</summary>
            <p className="mt-3 max-h-80 overflow-y-auto whitespace-pre-wrap text-sm text-ink/60">{transcript}</p>
          </details>
        ) : null}
        {canManage ? (
          <form className="mt-4 space-y-3 border-t border-ink/10 pt-4" onSubmit={submit}>
            <Textarea name="transcript" rows={5} placeholder="Paste a transcript, or upload the meeting audio below." defaultValue={transcript} />
            <label className="flex items-center gap-2 text-sm text-ink/60">
              <FileAudio className="h-4 w-4 text-moss" />
              <input name="audio" type="file" accept="audio/*" />
            </label>
            {error ? <p className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={processing}>
                {processing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Process transcript
              </Button>
              <Button type="button" variant="secondary" disabled={secretaryBusy} onClick={() => void runSecretary()}>
                {secretaryBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />}
                Run AI secretary
              </Button>
            </div>
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
              <p className="text-xs text-ink/50">
                Joined {new Date(item.joinedAt).toLocaleString()} -{" "}
                {item.durationSec ? `${Math.round(item.durationSec / 60)} minutes` : item.leftAt ? "under one minute" : "still present"}
              </p>
            </div>
          ))}
        </div>
      </div>

      {secretary ? (
        <div className="rounded-lg border border-ink/10 bg-white p-4 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold">
              <ClipboardList className="h-4 w-4 text-moss" />
              AI meeting secretary
            </h2>
            <span className="rounded-full bg-mint px-2.5 py-1 text-xs font-medium text-moss">
              {secretary.generatedBy === "openai" ? "OpenAI generated" : "Rule-based fallback"}
            </span>
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold text-ink">Decisions</p>
              {secretary.decisions.length ? (
                <ul className="mt-2 space-y-1 text-sm text-ink/65">
                  {secretary.decisions.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-ink/50">No explicit decisions were captured.</p>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Action items</p>
              {secretary.actionItems.length ? (
                <ul className="mt-2 space-y-1 text-sm text-ink/65">
                  {secretary.actionItems.map((item) => (
                    <li key={`${item.title}-${item.owner ?? ""}`}>
                      {item.title}
                      {item.owner ? ` - ${item.owner}` : ""}
                      {item.dueDate ? ` - due ${item.dueDate}` : ""}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-ink/50">No action items were captured.</p>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Attendance insight</p>
              <p className="mt-2 whitespace-pre-wrap text-sm text-ink/65">{secretary.attendanceInsight}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-ink">Risks</p>
              {secretary.risks.length ? (
                <ul className="mt-2 space-y-1 text-sm text-ink/65">
                  {secretary.risks.map((item) => <li key={item}>{item}</li>)}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-ink/50">No risks were detected.</p>
              )}
            </div>
          </div>
          <div className="mt-4 rounded-md bg-paper p-3">
            <p className="text-sm font-semibold text-ink">Follow-up draft</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-ink/65">{secretary.followUpDraft}</p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
