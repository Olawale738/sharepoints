"use client";

import { useEffect, useState } from "react";
import { CornerUpLeft, Hash, Loader2, MessageSquarePlus, Trash2, X } from "lucide-react";

import { ChatComposer } from "@/components/dashboard/chat-composer";
import { BubbleMessage, ChatMessageBubble } from "@/components/dashboard/chat-message-bubble";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useChatCollaboration } from "@/components/dashboard/use-chat-collaboration";

type Channel = {
  id: string;
  name: string;
  description?: string | null;
  _count?: {
    messages: number;
  };
};

type Message = BubbleMessage & {
  id: string;
  body: string;
  externalAuthor?: string | null;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  author?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
    image?: string | null;
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
  currentUserId: string;
  channels: Channel[];
  initialMessages: Message[];
  canCreateChannels: boolean;
  canDeleteChannels: boolean;
  canSendMessages: boolean;
};

export function ChatPanel({
  workspaceId,
  currentUserId,
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
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const collaboration = useChatCollaboration({
    kind: "channel",
    scopeId: activeChannelId,
    messageIds: messages.map((message) => message.id)
  });

  useEffect(() => {
    async function loadMessages(showLoading = false) {
      if (!activeChannelId) {
        setMessages([]);
        return;
      }

      if (showLoading) setIsLoading(true);
      const response = await fetch(`/api/channels/${activeChannelId}/messages`);
      if (showLoading) setIsLoading(false);

      if (response.ok) {
        const data = (await response.json()) as { messages: Message[] };
        setMessages(data.messages);
      }
    }

    setReplyingTo(null);
    void loadMessages(true);
    const interval = window.setInterval(loadMessages, 4_000);
    return () => window.clearInterval(interval);
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
      body: JSON.stringify({ body, replyToId: replyingTo?.id })
    });
    setIsSending(false);

    const data = (await response.json().catch(() => null)) as { message?: Message; error?: string } | null;

    if (!response.ok || !data?.message) {
      setError(data?.error ?? "Message could not be sent.");
      return;
    }

    setMessages((current) => [...current, data.message as Message]);
    setBody("");
    setReplyingTo(null);
    void collaboration.setTyping(false);
  }

  async function sendVoiceNote(voiceNote: Blob, durationMs: number) {
    if (!activeChannelId) {
      return false;
    }

    setError("");
    const formData = new FormData();
    formData.append("voiceNote", voiceNote, "voice-note.webm");
    formData.append("durationMs", String(durationMs));
    if (replyingTo?.id) formData.append("replyToId", replyingTo.id);
    const response = await fetch(`/api/channels/${activeChannelId}/messages`, {
      method: "POST",
      body: formData
    });
    const data = (await response.json().catch(() => null)) as { message?: Message; error?: string } | null;

    if (!response.ok || !data?.message) {
      setError(data?.error ?? "Voice note could not be sent.");
      return false;
    }

    setMessages((current) => [...current, data.message as Message]);
    setChannels((current) =>
      current.map((channel) =>
        channel.id === activeChannelId && channel._count
          ? { ...channel, _count: { messages: channel._count.messages + 1 } }
          : channel
      )
    );
    setReplyingTo(null);
    return true;
  }

  async function forwardMessage(message: Message) {
    if (!activeChannelId) return;
    const response = await fetch(`/api/channels/${activeChannelId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body: message.body || (message.voiceStorageKey ? "Forwarded voice note" : "Forwarded message"),
        forwardedFromId: message.id
      })
    });
    const data = (await response.json().catch(() => null)) as { message?: Message; error?: string } | null;

    if (!response.ok || !data?.message) {
      setError(data?.error ?? "Message could not be forwarded.");
      return;
    }

    setMessages((current) => [...current, data.message as Message]);
  }

  function updateMessage(updatedMessage: Message) {
    setMessages((current) => current.map((message) => (message.id === updatedMessage.id ? updatedMessage : message)));
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

        <div className="flex-1 space-y-3 overflow-y-auto bg-paper px-4 py-4">
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
            <ChatMessageBubble
              key={message.id}
              currentUserId={currentUserId}
              endpoint={`/api/channels/${activeChannelId}/messages/${message.id}`}
              message={message}
              replyPreview={messages.find((item) => item.id === message.replyToId)}
              reactions={collaboration.byMessageId[message.id]?.reactions}
              readCount={collaboration.byMessageId[message.id]?.readCount}
              bookmarked={collaboration.byMessageId[message.id]?.bookmarked}
              pinned={collaboration.byMessageId[message.id]?.pinned}
              voiceKind="channel"
              onError={setError}
              onReply={(item) => setReplyingTo(item as Message)}
              onForward={(item) => void forwardMessage(item as Message)}
              onReact={(messageId, emoji) => void collaboration.react(messageId, emoji)}
              onBookmark={(messageId) => void collaboration.toggleBookmark(messageId)}
              onPin={(messageId) => void collaboration.togglePin(messageId)}
              onMessageChange={(updatedMessage) => updateMessage(updatedMessage as Message)}
            />
          ))}
          {collaboration.typingUsers.length ? (
            <p className="text-xs italic text-ink/45">{collaboration.typingUsers.join(", ")} typing...</p>
          ) : null}
        </div>

        <div className="border-t border-ink/10 p-4">
          {error ? <p className="mb-2 rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
          {replyingTo ? (
            <div className="mb-2 flex items-center justify-between rounded-md border-l-2 border-moss bg-mint/45 px-3 py-2 text-xs">
              <span className="flex min-w-0 items-center gap-2">
                <CornerUpLeft className="h-3.5 w-3.5 shrink-0 text-moss" />
                <span className="truncate">
                  Replying to {replyingTo.author?.name ?? replyingTo.author?.email ?? "message"}:{" "}
                  {replyingTo.voiceStorageKey ? "Voice note" : replyingTo.body}
                </span>
              </span>
              <button aria-label="Cancel reply" type="button" onClick={() => setReplyingTo(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}
          <ChatComposer
            key={activeChannelId}
            disabled={!canSendMessages || !activeChannelId}
            isSending={isSending}
            placeholder="Message this channel"
            value={body}
            onChange={setBody}
            onSend={sendMessage}
            onSendVoiceNote={sendVoiceNote}
            onTyping={(active) => void collaboration.setTyping(active)}
          />
        </div>
      </section>
    </div>
  );
}
