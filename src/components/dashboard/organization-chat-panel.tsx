"use client";

import { useEffect, useState } from "react";
import { Building2, CornerUpLeft, Loader2, UsersRound, X } from "lucide-react";

import { ChatComposer } from "@/components/dashboard/chat-composer";
import { BubbleMessage, ChatMessageBubble } from "@/components/dashboard/chat-message-bubble";
import { ForwardMessageDialog } from "@/components/dashboard/forward-message-dialog";
import { useChatCollaboration } from "@/components/dashboard/use-chat-collaboration";
import { useRealtimeScope } from "@/components/dashboard/use-realtime-scope";

type OrgChatMessage = BubbleMessage & {
  id: string;
  body: string;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  author: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
};

type OrgChatRoom = {
  id: string;
  audience: "ALL" | "ADMIN" | "LEADER" | "MODERATOR" | "USER";
  name: string;
  description?: string | null;
  audienceMembersCount: number;
  canSendMessages: boolean;
  _count?: {
    messages: number;
  };
  messages?: OrgChatMessage[];
};

type OrganizationChatPanelProps = {
  currentUserId: string;
  rooms: OrgChatRoom[];
  initialMessages: OrgChatMessage[];
};

export function OrganizationChatPanel({
  currentUserId,
  rooms: initialRooms,
  initialMessages
}: OrganizationChatPanelProps) {
  const [rooms, setRooms] = useState(initialRooms);
  const [activeRoomId, setActiveRoomId] = useState(initialRooms[0]?.id ?? "");
  const [messages, setMessages] = useState(initialMessages);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [replyingTo, setReplyingTo] = useState<OrgChatMessage | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<OrgChatMessage | null>(null);

  const activeRoom = rooms.find((room) => room.id === activeRoomId);
  const canSendMessages = Boolean(activeRoom?.canSendMessages);
  const collaboration = useChatCollaboration({
    kind: "organization",
    scopeId: activeRoomId,
    messageIds: messages.map((message) => message.id)
  });
  const realtimeStatus = useRealtimeScope("organization", activeRoomId, (event, data) => {
    if (event !== "message.created" && event !== "message.updated") return;
    const incoming = data as OrgChatMessage;
    setMessages((current) => {
      const exists = current.some((message) => message.id === incoming.id);
      return exists
        ? current.map((message) => (message.id === incoming.id ? incoming : message))
        : [...current, incoming];
    });
  });

  useEffect(() => {
    async function loadMessages(showLoading = false) {
      if (!activeRoomId) {
        setMessages([]);
        return;
      }

      setError("");
      if (showLoading) setIsLoading(true);
      const response = await fetch(`/api/org-chat/rooms/${activeRoomId}/messages`);
      if (showLoading) setIsLoading(false);

      const data = (await response.json().catch(() => null)) as {
        messages?: OrgChatMessage[];
        error?: string;
      } | null;

      if (!response.ok || !data?.messages) {
        setError(data?.error ?? "Messages could not be loaded.");
        return;
      }

      setMessages(data.messages);
    }

    setReplyingTo(null);
    void loadMessages(true);
    if (realtimeStatus !== "fallback") return;
    const interval = window.setInterval(loadMessages, 15_000);
    return () => window.clearInterval(interval);
  }, [activeRoomId, realtimeStatus]);

  async function sendMessage() {
    if (!activeRoomId || !body.trim()) {
      return;
    }

    setError("");
    setIsSending(true);
    const response = await fetch(`/api/org-chat/rooms/${activeRoomId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body, replyToId: replyingTo?.id })
    });
    setIsSending(false);

    const data = (await response.json().catch(() => null)) as {
      message?: OrgChatMessage;
      error?: string;
    } | null;

    if (!response.ok || !data?.message) {
      setError(data?.error ?? "Message could not be sent.");
      return;
    }

    setMessages((current) => [...current, data.message as OrgChatMessage]);
    setRooms((current) =>
      current.map((room) =>
        room.id === activeRoomId
          ? {
              ...room,
              _count: {
                messages: (room._count?.messages ?? 0) + 1
              }
            }
          : room
      )
    );
    setBody("");
    setReplyingTo(null);
    void collaboration.setTyping(false);
  }

  async function sendVoiceNote(voiceNote: Blob, durationMs: number) {
    if (!activeRoomId) {
      return false;
    }

    setError("");
    const formData = new FormData();
    formData.append("voiceNote", voiceNote, "voice-note.webm");
    formData.append("durationMs", String(durationMs));
    if (replyingTo?.id) formData.append("replyToId", replyingTo.id);
    const response = await fetch(`/api/org-chat/rooms/${activeRoomId}/messages`, {
      method: "POST",
      body: formData
    });
    const data = (await response.json().catch(() => null)) as {
      message?: OrgChatMessage;
      error?: string;
    } | null;

    if (!response.ok || !data?.message) {
      setError(data?.error ?? "Voice note could not be sent.");
      return false;
    }

    setMessages((current) => [...current, data.message as OrgChatMessage]);
    setRooms((current) =>
      current.map((room) =>
        room.id === activeRoomId
          ? {
              ...room,
              _count: {
                messages: (room._count?.messages ?? 0) + 1
              }
            }
          : room
      )
    );
    setReplyingTo(null);
    return true;
  }

  function updateMessage(updatedMessage: OrgChatMessage) {
    setMessages((current) =>
      current.map((message) => (message.id === updatedMessage.id ? updatedMessage : message))
    );
  }

  return (
    <div className="grid min-h-[34rem] overflow-hidden rounded-lg border border-ink/10 bg-white xl:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="border-b border-ink/10 bg-ink/[0.025] p-4 xl:border-b-0 xl:border-r">
        <div className="mb-4 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-moss" />
          <h2 className="text-sm font-semibold">Organization chat</h2>
        </div>

        <div className="space-y-1">
          {rooms.length === 0 ? <p className="text-sm text-ink/55">No rooms available.</p> : null}
          {rooms.map((room) => (
            <button
              key={room.id}
              className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${
                room.id === activeRoomId ? "bg-moss text-white" : "text-ink hover:bg-mint/60"
              }`}
              onClick={() => setActiveRoomId(room.id)}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium">{room.name}</span>
                <span className="shrink-0 text-xs opacity-75">{room._count?.messages ?? 0}</span>
              </span>
              <span className="mt-1 flex items-center gap-1 text-xs opacity-75">
                <UsersRound className="h-3 w-3" />
                {room.audienceMembersCount}
              </span>
            </button>
          ))}
        </div>
      </aside>

      <section className="flex min-h-[34rem] flex-col">
        <header className="border-b border-ink/10 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold">{activeRoom?.name ?? "Organization chat"}</h3>
            <span className={`text-xs ${realtimeStatus === "live" ? "text-moss" : "text-ink/45"}`}>
              {realtimeStatus === "live" ? "Live" : realtimeStatus === "fallback" ? "Reconnecting" : "Connecting"}
            </span>
          </div>
          {activeRoom?.description ? <p className="text-sm text-ink/55">{activeRoom.description}</p> : null}
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto bg-paper px-4 py-4">
          {isLoading ? (
            <p className="flex items-center gap-2 text-sm text-ink/55">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading messages
            </p>
          ) : null}
          {!isLoading && !activeRoomId ? (
            <p className="text-sm text-ink/55">No organization room selected.</p>
          ) : null}
          {!isLoading && activeRoomId && messages.length === 0 ? (
            <p className="text-sm text-ink/55">No messages yet.</p>
          ) : null}
          {messages.map((message) => (
            <ChatMessageBubble
              key={message.id}
              currentUserId={currentUserId}
              endpoint={`/api/org-chat/rooms/${activeRoomId}/messages/${message.id}`}
              message={message}
              replyPreview={messages.find((item) => item.id === message.replyToId)}
              reactions={collaboration.byMessageId[message.id]?.reactions}
              readCount={collaboration.byMessageId[message.id]?.readCount}
              bookmarked={collaboration.byMessageId[message.id]?.bookmarked}
              pinned={collaboration.byMessageId[message.id]?.pinned}
              voiceKind="organization"
              onError={setError}
              onReply={(item) => setReplyingTo(item as OrgChatMessage)}
              onForward={(item) => setForwardingMessage(item as OrgChatMessage)}
              onReact={(messageId, emoji) => void collaboration.react(messageId, emoji)}
              onBookmark={(messageId) => void collaboration.toggleBookmark(messageId)}
              onPin={(messageId) => void collaboration.togglePin(messageId)}
              onMessageChange={(updatedMessage) => updateMessage(updatedMessage as OrgChatMessage)}
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
                  Replying to {replyingTo.author.name ?? replyingTo.author.email ?? "message"}:{" "}
                  {replyingTo.voiceStorageKey ? "Voice note" : replyingTo.body}
                </span>
              </span>
              <button aria-label="Cancel reply" type="button" onClick={() => setReplyingTo(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}
          <ChatComposer
            key={activeRoomId}
            disabled={!activeRoomId || !canSendMessages}
            isSending={isSending}
            placeholder="Message this room"
            value={body}
            onChange={setBody}
            onSend={sendMessage}
            onSendVoiceNote={sendVoiceNote}
            onTyping={(active) => void collaboration.setTyping(active)}
          />
        </div>
      </section>
      {forwardingMessage ? (
        <ForwardMessageDialog
          sourceKind="organization"
          sourceMessageId={forwardingMessage.id}
          onClose={() => setForwardingMessage(null)}
          onError={setError}
        />
      ) : null}
    </div>
  );
}
