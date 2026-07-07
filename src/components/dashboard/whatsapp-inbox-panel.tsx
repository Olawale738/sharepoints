"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MessageCircle, RefreshCw, Send, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type InboxUser = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
};

type InboxWorkspace = {
  id: string;
  name: string;
};

type InboxConversation = {
  id: string;
  userId: string | null;
  workspaceId: string | null;
  phone: string;
  displayName: string | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: InboxUser | null;
  workspace: InboxWorkspace | null;
};

type InboxMessage = {
  id: string;
  conversationId: string;
  direction: "INBOUND" | "OUTBOUND";
  status: string;
  fromPhone: string | null;
  toPhone: string | null;
  messageType: string;
  body: string | null;
  createdAt: string;
};

type InboxPayload = {
  whatsApp: {
    configured: boolean;
    graphVersion: string;
    webhookConfigured: boolean;
    signatureVerification: boolean;
  };
  selectedConversationId: string | null;
  conversations: InboxConversation[];
  messages: InboxMessage[];
  error?: string;
};

function formatDateTime(value?: string | null) {
  if (!value) return "No messages yet";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function WhatsAppInboxPanel() {
  const [payload, setPayload] = useState<InboxPayload | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (conversationId: string | null) => {
    setLoading(true);
    setError("");
    const suffix = conversationId ? `?conversationId=${conversationId}` : "";
    const response = await fetch(`/api/admin/whatsapp-inbox${suffix}`);
    const data = (await response.json().catch(() => null)) as InboxPayload | null;
    setLoading(false);
    if (!response.ok || !data) {
      setError(data?.error ?? "WhatsApp inbox could not load.");
      return;
    }
    setPayload(data);
    setSelectedId(data.selectedConversationId);
  }, []);

  useEffect(() => {
    void load(null);
  }, [load]);

  const selected = useMemo(
    () => payload?.conversations.find((conversation) => conversation.id === selectedId) ?? null,
    [payload?.conversations, selectedId]
  );

  async function choose(conversationId: string) {
    setSelectedId(conversationId);
    await load(conversationId);
  }

  async function sendReply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId || !reply.trim()) return;
    setSending(true);
    setError("");
    const messageBody = reply.trim();
    const response = await fetch("/api/admin/whatsapp-inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: selectedId, body: messageBody })
    });
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    setSending(false);
    if (!response.ok) {
      setError(data?.error ?? "WhatsApp reply failed.");
      return;
    }
    setReply("");
    await load(selectedId);
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <MessageCircle className="h-4 w-4" />
              WhatsApp two-way inbox
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Member WhatsApp conversations</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
              Receive WhatsApp replies from members, match them to LETW profiles by phone number, notify admins, and reply from one secure inbox.
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={() => void load(selectedId)} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>
        {payload ? (
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <div className="rounded-md border border-ink/10 bg-paper p-3">
              <p className="text-xs uppercase text-ink/45">Cloud API</p>
              <p className={payload.whatsApp.configured ? "mt-1 font-semibold text-moss" : "mt-1 font-semibold text-clay"}>
                {payload.whatsApp.configured ? "Configured" : "Missing keys"}
              </p>
            </div>
            <div className="rounded-md border border-ink/10 bg-paper p-3">
              <p className="text-xs uppercase text-ink/45">Webhook token</p>
              <p className={payload.whatsApp.webhookConfigured ? "mt-1 font-semibold text-moss" : "mt-1 font-semibold text-clay"}>
                {payload.whatsApp.webhookConfigured ? "Ready" : "Not set"}
              </p>
            </div>
            <div className="rounded-md border border-ink/10 bg-paper p-3">
              <p className="text-xs uppercase text-ink/45">Signature check</p>
              <p className="mt-1 font-semibold text-ink">{payload.whatsApp.signatureVerification ? "Enabled" : "Optional"}</p>
            </div>
            <div className="rounded-md border border-ink/10 bg-paper p-3">
              <p className="text-xs uppercase text-ink/45">Conversations</p>
              <p className="mt-1 font-semibold text-ink">{payload.conversations.length}</p>
            </div>
          </div>
        ) : null}
      </section>

      {error ? <p className="rounded-lg border border-clay/20 bg-clay/10 px-4 py-3 text-sm text-clay">{error}</p> : null}

      <section className="grid min-h-[34rem] gap-4 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="overflow-hidden rounded-lg border border-ink/10 bg-white shadow-soft">
          <div className="border-b border-ink/10 px-4 py-3">
            <p className="text-sm font-semibold text-ink">Conversations</p>
          </div>
          <div className="max-h-[34rem] overflow-y-auto">
            {loading && !payload ? <p className="p-4 text-sm text-ink/50">Loading WhatsApp inbox...</p> : null}
            {payload?.conversations.length === 0 ? <p className="p-4 text-sm text-ink/50">No WhatsApp messages have arrived yet.</p> : null}
            {payload?.conversations.map((conversation) => (
              <button
                className={`block w-full border-b border-ink/10 px-4 py-3 text-left transition hover:bg-mint/40 ${
                  selectedId === conversation.id ? "bg-mint/60" : "bg-white"
                }`}
                key={conversation.id}
                onClick={() => void choose(conversation.id)}
                type="button"
              >
                <span className="block truncate text-sm font-semibold text-ink">
                  {conversation.displayName ?? conversation.user?.name ?? conversation.phone}
                </span>
                <span className="mt-1 block truncate text-xs text-ink/50">
                  {conversation.user?.email ?? conversation.phone}
                </span>
                <span className="mt-2 flex items-center justify-between gap-2 text-xs text-ink/45">
                  <span>{conversation.workspace?.name ?? "No workspace matched"}</span>
                  <span>{formatDateTime(conversation.lastMessageAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <div className="flex min-h-[34rem] flex-col overflow-hidden rounded-lg border border-ink/10 bg-white shadow-soft">
          <div className="border-b border-ink/10 px-4 py-3">
            {selected ? (
              <>
                <p className="text-sm font-semibold text-ink">{selected.displayName ?? selected.user?.name ?? selected.phone}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink/50">
                  <span>{selected.phone}</span>
                  {selected.user ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-mint px-2 py-0.5 text-moss">
                      <ShieldCheck className="h-3 w-3" />
                      matched profile
                    </span>
                  ) : null}
                  {selected.workspace ? <span>{selected.workspace.name}</span> : null}
                </p>
              </>
            ) : (
              <p className="text-sm font-semibold text-ink">Select a conversation</p>
            )}
          </div>

          <div className="flex-1 space-y-3 overflow-y-auto bg-paper p-4">
            {payload?.messages.map((message) => {
              const outbound = message.direction === "OUTBOUND";
              return (
                <div className={`flex ${outbound ? "justify-end" : "justify-start"}`} key={message.id}>
                  <div
                    className={`max-w-[78%] rounded-2xl px-4 py-3 shadow-sm ${
                      outbound ? "rounded-br-sm bg-moss text-white" : "rounded-bl-sm border border-ink/10 bg-white text-ink"
                    }`}
                  >
                    <p className="whitespace-pre-wrap text-sm leading-6">{message.body ?? `[${message.messageType} message]`}</p>
                    <p className={`mt-2 text-[11px] ${outbound ? "text-white/70" : "text-ink/45"}`}>
                      {formatDateTime(message.createdAt)} - {message.status.toLowerCase()}
                    </p>
                  </div>
                </div>
              );
            })}
            {selected && payload?.messages.length === 0 ? <p className="text-sm text-ink/50">No saved messages in this conversation.</p> : null}
          </div>

          {selected ? (
            <form className="border-t border-ink/10 bg-white p-3" onSubmit={sendReply}>
              <Textarea
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                placeholder="Write a WhatsApp reply..."
                rows={3}
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-xs text-ink/50">Free-form WhatsApp replies work inside the active Meta service window.</p>
                <Button type="submit" disabled={sending || !reply.trim()}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send reply
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      </section>
    </div>
  );
}
