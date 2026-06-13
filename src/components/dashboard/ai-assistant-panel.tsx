"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpenCheck,
  FileSearch,
  Loader2,
  MessageSquareQuote,
  Plus,
  Send,
  ShieldCheck,
  Sparkles
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Source = {
  id: string;
  type: string;
  title: string;
  workspaceId: string | null;
  workspaceName: string | null;
  href: string;
  excerpt: string;
  updatedAt: string;
};

type Message = {
  id: string;
  role: string;
  content: string;
  mode: string | null;
  sources: Source[] | null;
  createdAt: string;
};

type Thread = {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: string;
};

type Access = {
  role: string;
  workspaces: Array<{ id: string; name: string }>;
};

const modes = [
  ["ASK", "Ask"],
  ["SUMMARIZE", "Summarize"],
  ["DRAFT", "Draft"],
  ["ACTION_ITEMS", "Action items"],
  ["REPORT", "Report"],
  ["TRANSLATE", "Translate"]
] as const;

const examples = [
  "Summarize the latest approved announcements.",
  "Which open tasks are assigned to me?",
  "Find the policy concerning annual leave.",
  "What decisions were made in recent meetings?",
  "Draft a follow-up message based on approved information."
];

export function AiAssistantPanel() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [access, setAccess] = useState<Access>({ role: "USER", workspaces: [] });
  const [threadId, setThreadId] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState("");
  const [mode, setMode] = useState<(typeof modes)[number][0]>("ASK");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const activeThread = useMemo(() => threads.find((thread) => thread.id === threadId), [threadId, threads]);

  useEffect(() => {
    let active = true;
    fetch("/api/ai-assistant")
      .then(async (response) => {
        const data = (await response.json()) as { access?: Access; threads?: Thread[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Assistant could not load.");
        if (!active) return;
        setAccess(data.access ?? { role: "USER", workspaces: [] });
        setThreads(data.threads ?? []);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Assistant could not load.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function selectThread(thread: Thread) {
    setThreadId(thread.id);
    const lastAnswer = [...thread.messages].reverse().find((message) => message.role === "ASSISTANT");
    setAnswer(lastAnswer?.content ?? "");
    setSources(Array.isArray(lastAnswer?.sources) ? lastAnswer.sources : []);
    setError("");
  }

  function newThread() {
    setThreadId(null);
    setQuestion("");
    setAnswer("");
    setSources([]);
    setError("");
  }

  async function ask() {
    if (question.trim().length < 2) return;
    setAsking(true);
    setError("");
    const response = await fetch("/api/ai-assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        mode,
        workspaceId: workspaceId || null,
        threadId
      })
    });
    const data = (await response.json().catch(() => null)) as
      | { threadId?: string; answer?: string; sources?: Source[]; error?: string }
      | null;
    setAsking(false);
    if (!response.ok || !data?.answer || !data.threadId) {
      setError(data?.error ?? "The assistant could not answer.");
      return;
    }
    setThreadId(data.threadId);
    setAnswer(data.answer);
    setSources(data.sources ?? []);
    setQuestion("");
    const refresh = await fetch("/api/ai-assistant");
    if (refresh.ok) {
      const refreshed = (await refresh.json()) as { threads: Thread[] };
      setThreads(refreshed.threads);
    }
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[19rem_minmax(0,1fr)]">
      <aside className="overflow-hidden rounded-lg border border-ink/10 bg-white">
        <div className="border-b border-ink/10 p-3">
          <Button className="w-full" variant="secondary" onClick={newThread}>
            <Plus className="h-4 w-4" />
            New conversation
          </Button>
        </div>
        <div className="max-h-[38rem] divide-y divide-ink/10 overflow-y-auto">
          {loading ? <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-moss" /></div> : null}
          {!loading && threads.length === 0 ? <p className="p-5 text-sm text-ink/50">No conversations yet.</p> : null}
          {threads.map((thread) => (
            <button
              className={`w-full px-4 py-3 text-left transition hover:bg-mint/35 ${thread.id === threadId ? "bg-mint/50" : ""}`}
              key={thread.id}
              onClick={() => selectThread(thread)}
              type="button"
            >
              <p className="line-clamp-2 text-sm font-medium text-ink">{thread.title}</p>
              <p className="mt-1 text-xs text-ink/40">{new Date(thread.updatedAt).toLocaleDateString()}</p>
            </button>
          ))}
        </div>
      </aside>

      <section className="overflow-hidden rounded-lg border border-ink/10 bg-white">
        <div className="border-b border-ink/10 bg-paper p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Sparkles className="h-4 w-4 text-moss" />
                Permission-aware AI
              </p>
              <p className="mt-1 text-xs text-ink/50">Read-only answers from information you are authorized to access.</p>
            </div>
            <Badge className="bg-mint">{access.role.toLowerCase()} access</Badge>
          </div>
        </div>

        <div className="space-y-5 p-5">
          <div className="rounded-md border border-moss/20 bg-mint/35 p-3 text-xs text-ink/65">
            <p className="flex items-center gap-2 font-semibold text-ink"><ShieldCheck className="h-4 w-4 text-moss" />Permission boundary active</p>
            <p className="mt-1">Deleted, rejected, restricted, direct-message, counselling, safeguarding, and Member CRM content is never sent to the AI.</p>
          </div>

          {activeThread?.messages.length ? (
            <div className="max-h-72 space-y-3 overflow-y-auto rounded-md border border-ink/10 bg-paper p-3">
              {activeThread.messages.map((message) => (
                <div className={message.role === "USER" ? "ml-8 rounded-md bg-moss px-3 py-2 text-sm text-white" : "mr-8 rounded-md bg-white px-3 py-2 text-sm text-ink"} key={message.id}>
                  {message.content}
                </div>
              ))}
            </div>
          ) : null}

          {answer ? (
            <div className="rounded-lg border border-ink/10 bg-paper p-4">
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-moss"><MessageSquareQuote className="h-4 w-4" />LETW AI answer</p>
              <div className="whitespace-pre-wrap text-sm leading-7 text-ink">{answer}</div>
            </div>
          ) : (
            <div>
              <p className="text-sm font-semibold text-ink">Try an authorized question</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {examples.map((example) => (
                  <button className="rounded-md border border-ink/10 bg-paper px-3 py-2 text-left text-xs text-ink/65 transition hover:bg-mint" key={example} onClick={() => setQuestion(example)} type="button">
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}

          {sources.length ? (
            <div>
              <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><BookOpenCheck className="h-4 w-4 text-moss" />Authorized sources</p>
              <div className="grid gap-2 md:grid-cols-2">
                {sources.map((source, index) => (
                  <Link className="rounded-md border border-ink/10 bg-white p-3 transition hover:bg-mint/30" href={source.href} key={`${source.type}-${source.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium text-ink">[S{index + 1}] {source.title}</p>
                      <Badge>{source.type}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink/45">{source.workspaceName ?? "Organization-wide"}</p>
                    <p className="mt-2 line-clamp-2 text-xs text-ink/60">{source.excerpt}</p>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}

          {error ? <p className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}

          <div className="border-t border-ink/10 pt-4">
            <div className="flex flex-wrap gap-2">
              {modes.map(([value, label]) => (
                <button className={`rounded-md border px-3 py-2 text-xs font-medium transition ${mode === value ? "border-moss bg-mint text-ink" : "border-ink/10 bg-white text-ink/60"}`} key={value} onClick={() => setMode(value)} type="button">
                  {label}
                </button>
              ))}
            </div>
            <label className="mt-3 block text-xs font-medium text-ink/60">
              Information scope
              <select className="mt-1 h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm text-ink outline-none focus:border-moss" value={workspaceId} onChange={(event) => setWorkspaceId(event.target.value)}>
                <option value="">All workspaces I can access</option>
                {access.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
              </select>
            </label>
            <div className="mt-3 flex items-end gap-2">
              <Textarea className="min-h-28 flex-1" placeholder="Ask LETW AI about approved files, policies, meetings, chats, knowledge pages, or your assigned tasks..." value={question} onChange={(event) => setQuestion(event.target.value)} />
              <Button className="h-11" disabled={asking || question.trim().length < 2} onClick={ask}>
                {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Ask
              </Button>
            </div>
            <p className="mt-2 flex items-center gap-1 text-xs text-ink/40"><FileSearch className="h-3.5 w-3.5" />Suggestions never send messages or change records without a separate confirmed action.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
