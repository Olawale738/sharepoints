"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageCircle, MessagesSquare, UserRound } from "lucide-react";

import { ChatComposer } from "@/components/dashboard/chat-composer";
import { BubbleMessage, ChatMessageBubble } from "@/components/dashboard/chat-message-bubble";
import { Button } from "@/components/ui/button";

type WorkspaceMember = {
  userId: string;
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
};

type DirectMessage = BubbleMessage & {
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

type DirectConversation = {
  id: string;
  participantAId: string;
  participantBId: string;
  participantA: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  participantB: {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
  messages: DirectMessage[];
  updatedAt: string;
  lastMessageAt?: string | null;
};

type DirectMessagesPanelProps = {
  workspaceId: string;
  currentUserId: string;
  members: WorkspaceMember[];
  conversations: DirectConversation[];
  canSendMessages: boolean;
};

function displayName(user: { name?: string | null; email?: string | null }) {
  return user.name ?? user.email ?? "Workspace member";
}

function previewText(message?: DirectMessage) {
  if (!message) {
    return "";
  }

  return message.deletedAt ? "This message was deleted." : message.body;
}

export function DirectMessagesPanel({
  workspaceId,
  currentUserId,
  members,
  conversations: initialConversations,
  canSendMessages
}: DirectMessagesPanelProps) {
  const messageableMembers = members.filter((member) => member.userId !== currentUserId);
  const [conversations, setConversations] = useState(initialConversations);
  const [activeConversationId, setActiveConversationId] = useState(initialConversations[0]?.id ?? "");
  const [messages, setMessages] = useState(initialConversations[0]?.messages ?? []);
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [startingUserId, setStartingUserId] = useState("");
  const [isSending, setIsSending] = useState(false);

  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId);

  function conversationPartner(conversation: DirectConversation) {
    return conversation.participantAId === currentUserId ? conversation.participantB : conversation.participantA;
  }

  useEffect(() => {
    async function loadMessages() {
      if (!activeConversationId) {
        setMessages([]);
        return;
      }

      setError("");
      setIsLoading(true);
      const response = await fetch(`/api/direct-conversations/${activeConversationId}/messages`);
      setIsLoading(false);

      const data = (await response.json().catch(() => null)) as {
        messages?: DirectMessage[];
        error?: string;
      } | null;

      if (!response.ok || !data?.messages) {
        setError(data?.error ?? "Direct messages could not be loaded.");
        return;
      }

      setMessages(data.messages);
    }

    loadMessages();
  }, [activeConversationId]);

  async function startConversation(targetUserId: string) {
    setError("");
    setStartingUserId(targetUserId);

    const response = await fetch(`/api/workspaces/${workspaceId}/direct-conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetUserId })
    });
    setStartingUserId("");

    const data = (await response.json().catch(() => null)) as {
      conversation?: DirectConversation;
      error?: string;
    } | null;

    if (!response.ok || !data?.conversation) {
      setError(data?.error ?? "Conversation could not be started.");
      return;
    }

    const conversation = data.conversation;
    setConversations((current) => {
      const withoutDuplicate = current.filter((item) => item.id !== conversation.id);
      return [conversation, ...withoutDuplicate];
    });
    setMessages(conversation.messages ?? []);
    setActiveConversationId(conversation.id);
  }

  async function sendMessage() {
    if (!activeConversationId || !body.trim()) {
      return;
    }

    setError("");
    setIsSending(true);
    const response = await fetch(`/api/direct-conversations/${activeConversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body })
    });
    setIsSending(false);

    const data = (await response.json().catch(() => null)) as {
      message?: DirectMessage;
      error?: string;
    } | null;

    if (!response.ok || !data?.message) {
      setError(data?.error ?? "Direct message could not be sent.");
      return;
    }

    const message = data.message;
    setMessages((current) => [...current, message]);
    setConversations((current) => {
      const active = current.find((conversation) => conversation.id === activeConversationId);

      if (!active) {
        return current;
      }

      return [
        { ...active, messages: [...active.messages, message], lastMessageAt: message.createdAt },
        ...current.filter((conversation) => conversation.id !== activeConversationId)
      ];
    });
    setBody("");
  }

  function updateMessage(updatedMessage: DirectMessage) {
    setMessages((current) =>
      current.map((message) => (message.id === updatedMessage.id ? updatedMessage : message))
    );
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === activeConversationId
          ? {
              ...conversation,
              messages: conversation.messages.map((message) =>
                message.id === updatedMessage.id ? updatedMessage : message
              )
            }
          : conversation
      )
    );
  }

  return (
    <div className="grid min-h-[30rem] overflow-hidden rounded-lg border border-ink/10 bg-white lg:grid-cols-[17rem_minmax(0,1fr)]">
      <aside className="border-b border-ink/10 bg-ink/[0.025] p-4 lg:border-b-0 lg:border-r">
        <div className="mb-4 flex items-center gap-2">
          <MessagesSquare className="h-4 w-4 text-moss" />
          <h2 className="text-sm font-semibold">Member messages</h2>
        </div>

        <div className="mb-5 space-y-1">
          {conversations.length === 0 ? <p className="text-sm text-ink/55">No direct messages yet.</p> : null}
          {conversations.map((conversation) => {
            const partner = conversationPartner(conversation);
            const latestMessage = conversation.messages.at(-1);

            return (
              <button
                key={conversation.id}
                className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${
                  conversation.id === activeConversationId ? "bg-moss text-white" : "text-ink hover:bg-mint/60"
                }`}
                onClick={() => setActiveConversationId(conversation.id)}
              >
                <span className="flex items-center gap-2 font-medium">
                  <UserRound className="h-4 w-4 shrink-0" />
                  <span className="truncate">{displayName(partner)}</span>
                </span>
                {latestMessage ? (
                  <span className="mt-1 block truncate text-xs opacity-75">{previewText(latestMessage)}</span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="border-t border-ink/10 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase text-ink/45">People</p>
          <div className="space-y-2">
            {messageableMembers.length === 0 ? (
              <p className="text-sm text-ink/55">No other members yet.</p>
            ) : null}
            {messageableMembers.map((member) => (
              <div key={member.userId} className="flex items-center justify-between gap-2 rounded-md bg-white px-2 py-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{displayName(member.user)}</p>
                  <p className="truncate text-xs text-ink/45">{member.user.email}</p>
                </div>
                <Button
                  aria-label={`Message ${displayName(member.user)}`}
                  className="h-8 w-8 shrink-0 px-0"
                  variant="secondary"
                  disabled={!canSendMessages || startingUserId === member.userId}
                  onClick={() => startConversation(member.userId)}
                >
                  {startingUserId === member.userId ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <MessageCircle className="h-3.5 w-3.5" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        </div>
      </aside>

      <section className="flex min-h-[30rem] flex-col">
        <header className="border-b border-ink/10 px-4 py-3">
          <h3 className="font-semibold">
            {activeConversation ? displayName(conversationPartner(activeConversation)) : "Select a member"}
          </h3>
          <p className="text-sm text-ink/55">Direct chat inside this workspace</p>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto bg-paper px-4 py-4">
          {isLoading ? (
            <p className="flex items-center gap-2 text-sm text-ink/55">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading direct messages
            </p>
          ) : null}
          {!isLoading && !activeConversationId ? (
            <p className="text-sm text-ink/55">Choose a workspace member to start messaging.</p>
          ) : null}
          {!isLoading && activeConversationId && messages.length === 0 ? (
            <p className="text-sm text-ink/55">No messages in this conversation yet.</p>
          ) : null}
          {messages.map((message) => (
              <ChatMessageBubble
                key={message.id}
                currentUserId={currentUserId}
                endpoint={`/api/direct-conversations/${activeConversationId}/messages/${message.id}`}
                message={message}
                onError={setError}
                onMessageChange={(updatedMessage) => updateMessage(updatedMessage as DirectMessage)}
              />
          ))}
        </div>

        <div className="border-t border-ink/10 p-4">
          {error ? <p className="mb-2 rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
          <ChatComposer
            disabled={!activeConversationId || !canSendMessages}
            isSending={isSending}
            placeholder="Message this member"
            value={body}
            onChange={setBody}
            onSend={sendMessage}
          />
        </div>
      </section>
    </div>
  );
}
