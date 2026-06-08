"use client";

import { useEffect, useState } from "react";
import { Building2, Loader2, Send, UsersRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

type OrgChatMessage = {
  id: string;
  body: string;
  createdAt: string;
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

function displayName(user: { name?: string | null; email?: string | null }) {
  return user.name ?? user.email ?? "Member";
}

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

  const activeRoom = rooms.find((room) => room.id === activeRoomId);
  const canSendMessages = Boolean(activeRoom?.canSendMessages);

  useEffect(() => {
    async function loadMessages() {
      if (!activeRoomId) {
        setMessages([]);
        return;
      }

      setError("");
      setIsLoading(true);
      const response = await fetch(`/api/org-chat/rooms/${activeRoomId}/messages`);
      setIsLoading(false);

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

    loadMessages();
  }, [activeRoomId]);

  async function sendMessage() {
    if (!activeRoomId || !body.trim()) {
      return;
    }

    setError("");
    setIsSending(true);
    const response = await fetch(`/api/org-chat/rooms/${activeRoomId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body })
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
          <h3 className="font-semibold">{activeRoom?.name ?? "Organization chat"}</h3>
          {activeRoom?.description ? <p className="text-sm text-ink/55">{activeRoom.description}</p> : null}
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
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
          {messages.map((message) => {
            const isMine = message.author.id === currentUserId;

            return (
              <article
                key={message.id}
                className={`max-w-[85%] rounded-md border border-ink/10 px-3 py-2 ${
                  isMine ? "ml-auto bg-mint/70" : "bg-paper"
                }`}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-ink/50">
                  <span className="font-medium text-ink">{displayName(message.author)}</span>
                  <span>{formatDate(message.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-sm text-ink">{message.body}</p>
              </article>
            );
          })}
        </div>

        <div className="border-t border-ink/10 p-4">
          {error ? <p className="mb-2 rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
          <div className="flex gap-2">
            <Input
              placeholder="Message this room"
              value={body}
              disabled={!activeRoomId || !canSendMessages}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
            />
            <Button
              className="shrink-0"
              disabled={!activeRoomId || !canSendMessages || isSending}
              onClick={sendMessage}
            >
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
