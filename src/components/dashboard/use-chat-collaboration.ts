"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type ChatKind = "channel" | "direct" | "organization";

type Reaction = {
  messageId: string;
  emoji: string;
  userId: string;
};

type Receipt = {
  messageId: string;
  _count: {
    messageId: number;
  };
};

export type MessageCollaboration = {
  reactions: Reaction[];
  readCount: number;
  bookmarked: boolean;
  pinned: boolean;
};

export function useChatCollaboration(input: {
  kind: ChatKind;
  scopeId: string;
  messageIds: string[];
}) {
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [bookmarkedMessageIds, setBookmarkedMessageIds] = useState<string[]>([]);
  const [pinnedMessageIds, setPinnedMessageIds] = useState<string[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);

  const messageIdKey = input.messageIds.join(",");

  const refresh = useCallback(async () => {
    if (!input.scopeId) return;

    const query = new URLSearchParams({
      messageKind: input.kind,
      scopeKind: input.kind,
      scopeId: input.scopeId,
      messageIds: messageIdKey
    });
    const response = await fetch(`/api/chat/collaboration?${query.toString()}`);

    if (!response.ok) return;

    const data = (await response.json()) as {
      reactions: Reaction[];
      receipts: Receipt[];
      bookmarkedMessageIds: string[];
      pinnedMessageIds: string[];
      typingUsers: string[];
    };
    setReactions(data.reactions);
    setReceipts(data.receipts);
    setBookmarkedMessageIds(data.bookmarkedMessageIds);
    setPinnedMessageIds(data.pinnedMessageIds);
    setTypingUsers(data.typingUsers);
  }, [input.kind, input.scopeId, messageIdKey]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(refresh, 4_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const act = useCallback(
    async (action: "REACT" | "BOOKMARK" | "PIN" | "READ", messageId: string, emoji?: string) => {
      const response = await fetch("/api/chat/collaboration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          messageKind: input.kind,
          messageId,
          emoji
        })
      });

      if (response.ok) {
        await refresh();
      }
    },
    [input.kind, refresh]
  );

  const setTyping = useCallback(
    async (active: boolean) => {
      if (!input.scopeId) return;
      await fetch("/api/chat/collaboration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "TYPING",
          scopeKind: input.kind,
          scopeId: input.scopeId,
          active
        })
      }).catch(() => undefined);
    },
    [input.kind, input.scopeId]
  );

  useEffect(() => {
    const latestMessageId = messageIdKey.split(",").filter(Boolean).at(-1);

    if (latestMessageId) {
      void act("READ", latestMessageId);
    }
  }, [act, messageIdKey]);

  const byMessageId = useMemo(() => {
    return Object.fromEntries(
      input.messageIds.map((messageId) => [
        messageId,
        {
          reactions: reactions.filter((reaction) => reaction.messageId === messageId),
          readCount: receipts.find((receipt) => receipt.messageId === messageId)?._count.messageId ?? 0,
          bookmarked: bookmarkedMessageIds.includes(messageId),
          pinned: pinnedMessageIds.includes(messageId)
        } satisfies MessageCollaboration
      ])
    ) as Record<string, MessageCollaboration>;
  }, [bookmarkedMessageIds, input.messageIds, pinnedMessageIds, reactions, receipts]);

  return {
    byMessageId,
    typingUsers,
    react: (messageId: string, emoji: string) => act("REACT", messageId, emoji),
    toggleBookmark: (messageId: string) => act("BOOKMARK", messageId),
    togglePin: (messageId: string) => act("PIN", messageId),
    setTyping,
    refresh
  };
}
