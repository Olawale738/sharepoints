"use client";

import { useEffect, useState } from "react";
import { Hash, Loader2, MessageSquarePlus, Paperclip, Send, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBytes, formatDate } from "@/lib/utils";

type Channel = {
  id: string;
  name: string;
  description?: string | null;
  _count?: {
    messages: number;
  };
};

type Message = {
  id: string;
  body: string;
  externalAuthor?: string | null;
  createdAt: string;
  author?: {
    name?: string | null;
    email?: string | null;
  } | null;
  attachmentFile?: {
    id: string;
    fileName: string;
    fileType: string;
    size: number;
  } | null;
};

type ChatPanelProps = {
  workspaceId: string;
  channels: Channel[];
  initialMessages: Message[];
  canCreateChannels: boolean;
  canDeleteChannels: boolean;
  canSendMessages: boolean;
};

export function ChatPanel({
  workspaceId,
  channels: initialChannels,
  initialMessages,
  canCreateChannels,
  canDeleteChannels,
  canSendMessages
}: ChatPanelProps) {
  const [channels, setChannels] = useState(initialChannels);
  const [activeChannelId, setActiveChannelId] = useState(initialChannels[0]?.id ?? "");
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [channelName, setChannelName] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [deletingChannelId, setDeletingChannelId] = useState("");

  useEffect(() => {
    async function loadMessages() {
      if (!activeChannelId) {
        setMessages([]);
        return;
      }

      setIsLoading(true);
      const response = await fetch(`/api/channels/${activeChannelId}/messages`);
      setIsLoading(false);

      if (response.ok) {
        const data = (await response.json()) as { messages: Message[] };
        setMessages(data.messages);
      }
    }

    loadMessages();
  }, [activeChannelId]);

  async function sendMessage() {
    if (!activeChannelId || !body.trim()) {
      return;
    }

    setError("");
    setIsSending(true);
    const response = await fetch(`/api/channels/${activeChannelId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body })
    });
    setIsSending(false);

    const data = (await response.json().catch(() => null)) as { message?: Message; error?: string } | null;

    if (!response.ok || !data?.message) {
      setError(data?.error ?? "Message could not be sent.");
      return;
    }

    setMessages((current) => [...current, data.message as Message]);
    setBody("");
  }

  async function createChannel() {
    if (!channelName.trim()) {
      return;
    }

    setError("");
    const response = await fetch(`/api/workspaces/${workspaceId}/channels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: channelName })
    });
    const data = (await response.json().catch(() => null)) as { channel?: Channel; error?: string } | null;

    if (!response.ok || !data?.channel) {
      setError(data?.error ?? "Channel could not be created.");
      return;
    }

    setChannels((current) => [...current, data.channel as Channel]);
    setActiveChannelId(data.channel.id);
    setMessages([]);
    setChannelName("");
  }

  async function deleteChannel(channelId: string, channelName: string) {
    if (!canDeleteChannels || channels.length <= 1) {
      return;
    }

    const confirmed = window.confirm(`Delete #${channelName}? Messages in this channel will also be deleted.`);

    if (!confirmed) {
      return;
    }

    setError("");
    setDeletingChannelId(channelId);
    const response = await fetch(`/api/channels/${channelId}`, {
      method: "DELETE"
    });
    const data = (await response.json().catch(() => null)) as { deletedChannelId?: string; error?: string } | null;
    setDeletingChannelId("");

    if (!response.ok || !data?.deletedChannelId) {
      setError(data?.error ?? "Channel could not be deleted.");
      return;
    }

    setChannels((current) => {
      const nextChannels = current.filter((channel) => channel.id !== data.deletedChannelId);

      if (activeChannelId === data.deletedChannelId) {
        setActiveChannelId(nextChannels[0]?.id ?? "");
        setMessages([]);
      }

      return nextChannels;
    });
  }

  const activeChannel = channels.find((channel) => channel.id === activeChannelId);

  return (
    <div className="grid min-h-[32rem] overflow-hidden rounded-lg border border-ink/10 bg-white lg:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="border-b border-ink/10 bg-ink/[0.025] p-4 lg:border-b-0 lg:border-r">
        <div className="mb-4 flex items-center gap-2">
          <Hash className="h-4 w-4 text-moss" />
          <h2 className="text-sm font-semibold">Channels</h2>
        </div>
        <div className="space-y-1">
          {channels.map((channel) => {
            const isActive = channel.id === activeChannelId;
            const isDeleting = deletingChannelId === channel.id;
            const deleteDisabled = isDeleting || channels.length <= 1;

            return (
              <div
                key={channel.id}
                className={`flex items-center rounded-md text-sm transition ${
                  isActive ? "bg-moss text-white" : "text-ink hover:bg-mint/60"
                }`}
              >
                <button
                  className="flex min-w-0 flex-1 items-center justify-between px-3 py-2 text-left"
                  onClick={() => setActiveChannelId(channel.id)}
                >
                  <span className="truncate"># {channel.name}</span>
                  {channel._count ? <span className="ml-2 text-xs opacity-70">{channel._count.messages}</span> : null}
                </button>
                {canDeleteChannels ? (
                  <button
                    className="mr-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded text-current transition hover:bg-white/20 disabled:pointer-events-none disabled:opacity-40"
                    disabled={deleteDisabled}
                    title={channels.length <= 1 ? "A workspace must keep at least one channel." : `Delete #${channel.name}`}
                    onClick={() => deleteChannel(channel.id, channel.name)}
                  >
                    {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
        {canCreateChannels ? (
          <div className="mt-4 flex gap-2">
            <Input
              className="h-9"
              placeholder="New channel"
              value={channelName}
              onChange={(event) => setChannelName(event.target.value)}
            />
            <Button className="h-9 w-9 px-0" variant="secondary" onClick={createChannel}>
              <MessageSquarePlus className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
      </aside>

      <section className="flex min-h-[32rem] flex-col">
        <header className="border-b border-ink/10 px-4 py-3">
          <h3 className="font-semibold"># {activeChannel?.name ?? "Channel"}</h3>
          {activeChannel?.description ? <p className="text-sm text-ink/55">{activeChannel.description}</p> : null}
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {isLoading ? (
            <p className="flex items-center gap-2 text-sm text-ink/55">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading messages
            </p>
          ) : null}
          {!isLoading && messages.length === 0 ? (
            <p className="text-sm text-ink/55">No messages yet.</p>
          ) : null}
          {messages.map((message) => (
            <article key={message.id} className="rounded-md border border-ink/10 bg-paper px-3 py-2">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-ink/50">
                <span className="font-medium text-ink">
                  {message.author?.name ?? message.author?.email ?? message.externalAuthor ?? "Webhook"}
                </span>
                <span>{formatDate(message.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-ink">{message.body}</p>
              {message.attachmentFile ? (
                <a
                  className="mt-2 inline-flex items-center gap-2 rounded-md border border-ink/10 bg-white px-2 py-1 text-xs text-moss"
                  href={`/api/files/${message.attachmentFile.id}/download`}
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  {message.attachmentFile.fileName} ({formatBytes(message.attachmentFile.size)})
                </a>
              ) : null}
            </article>
          ))}
        </div>

        <div className="border-t border-ink/10 p-4">
          {error ? <p className="mb-2 rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
          <div className="flex gap-2">
            <Input
              placeholder="Message this channel"
              value={body}
              disabled={!canSendMessages}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
            />
            <Button className="shrink-0" onClick={sendMessage} disabled={isSending || !activeChannelId || !canSendMessages}>
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
