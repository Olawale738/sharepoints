"use client";

import { useEffect, useState } from "react";
import {
  Bookmark,
  Check,
  CheckCheck,
  CornerUpLeft,
  Edit3,
  Forward,
  Loader2,
  Paperclip,
  Pin,
  SmilePlus,
  Trash2,
  X
} from "lucide-react";

import { VoiceNotePlayer } from "@/components/dashboard/voice-note-player";
import { TranslateTextButton } from "@/components/dashboard/translate-text-button";
import { Button } from "@/components/ui/button";
import { messageDeleteWindowMs } from "@/lib/message-constants";
import { formatBytes, formatDate } from "@/lib/utils";

export type BubbleMessage = {
  id: string;
  body: string;
  externalAuthor?: string | null;
  createdAt: string;
  editedAt?: string | null;
  deletedAt?: string | null;
  voiceStorageKey?: string | null;
  voiceMimeType?: string | null;
  voiceSize?: number | null;
  voiceDurationMs?: number | null;
  replyToId?: string | null;
  forwardedFromId?: string | null;
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

type ChatMessageBubbleProps = {
  currentUserId: string;
  message: BubbleMessage;
  endpoint: string;
  voiceKind: "channel" | "direct" | "organization";
  onMessageChange: (message: BubbleMessage) => void;
  onError: (message: string) => void;
  replyPreview?: BubbleMessage | null;
  reactions?: Array<{ emoji: string; userId: string }>;
  readCount?: number;
  bookmarked?: boolean;
  pinned?: boolean;
  onReply?: (message: BubbleMessage) => void;
  onForward?: (message: BubbleMessage) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onBookmark?: (messageId: string) => void;
  onPin?: (messageId: string) => void;
};

function authorName(message: BubbleMessage) {
  return message.author?.name ?? message.author?.email ?? message.externalAuthor ?? "Webhook";
}

export function ChatMessageBubble({
  currentUserId,
  message,
  endpoint,
  voiceKind,
  onMessageChange,
  onError,
  replyPreview,
  reactions = [],
  readCount = 0,
  bookmarked,
  pinned,
  onReply,
  onForward,
  onReact,
  onBookmark,
  onPin
}: ChatMessageBubbleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentTime, setCurrentTime] = useState<number | null>(null);

  useEffect(() => {
    setCurrentTime(Date.now());
    const interval = window.setInterval(() => setCurrentTime(Date.now()), 60_000);

    return () => window.clearInterval(interval);
  }, []);

  const isMine = Boolean(message.author?.id && message.author.id === currentUserId);
  const isDeleted = Boolean(message.deletedAt);
  const hasVoiceNote = Boolean(message.voiceStorageKey);
  const canManage = isMine && !isDeleted;
  const canEdit = canManage && Boolean(message.body.trim());
  const canDelete =
    canManage && currentTime !== null && currentTime - new Date(message.createdAt).getTime() <= messageDeleteWindowMs;
  const bubbleTone = isDeleted ? "bg-white/75 text-ink/55" : isMine ? "bg-mint text-ink" : "bg-white text-ink";
  const reactionGroups = Array.from(new Set(reactions.map((reaction) => reaction.emoji))).map((emoji) => ({
    emoji,
    count: reactions.filter((reaction) => reaction.emoji === emoji).length,
    selected: reactions.some((reaction) => reaction.emoji === emoji && reaction.userId === currentUserId)
  }));

  async function saveEdit() {
    if (!draft.trim() || draft.trim() === message.body) {
      setIsEditing(false);
      setDraft(message.body);
      return;
    }

    setIsSaving(true);
    const response = await fetch(endpoint, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: draft })
    });
    setIsSaving(false);

    const data = (await response.json().catch(() => null)) as { message?: BubbleMessage; error?: string } | null;

    if (!response.ok || !data?.message) {
      onError(data?.error ?? "Message could not be edited.");
      return;
    }

    onMessageChange(data.message);
    setIsEditing(false);
  }

  async function deleteMessage() {
    if (!window.confirm("Delete this message?")) {
      return;
    }

    setIsDeleting(true);
    const response = await fetch(endpoint, {
      method: "DELETE"
    });
    setIsDeleting(false);

    const data = (await response.json().catch(() => null)) as { message?: BubbleMessage; error?: string } | null;

    if (!response.ok || !data?.message) {
      onError(data?.error ?? "Message could not be deleted.");
      return;
    }

    onMessageChange(data.message);
    setIsEditing(false);
  }

  return (
    <article className={`group flex ${isMine ? "justify-end" : "justify-start"}`}>
      <div className={`relative max-w-[88%] rounded-2xl border border-ink/10 px-3 py-2 shadow-soft sm:max-w-[76%] ${bubbleTone}`}>
        <div
          className={`absolute top-4 h-3 w-3 rotate-45 border-b border-ink/10 ${
            isMine ? "-right-1 border-r bg-mint" : "-left-1 border-l bg-white"
          } ${isDeleted ? "bg-white/75" : ""}`}
        />
        <div className="relative">
          {!isMine ? <p className="mb-1 text-xs font-semibold text-moss">{authorName(message)}</p> : null}
          {pinned ? (
            <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-clay">
              <Pin className="h-3 w-3" />
              Pinned
            </p>
          ) : null}
          {message.forwardedFromId ? (
            <p className="mb-1 flex items-center gap-1 text-[11px] italic text-ink/45">
              <Forward className="h-3 w-3" />
              Forwarded
            </p>
          ) : null}
          {replyPreview ? (
            <div className="mb-2 border-l-2 border-moss bg-white/60 px-2 py-1 text-xs">
              <p className="font-medium text-moss">{authorName(replyPreview)}</p>
              <p className="line-clamp-2 text-ink/55">
                {replyPreview.deletedAt
                  ? "Deleted message"
                  : replyPreview.voiceStorageKey
                    ? "Voice note"
                    : replyPreview.body}
              </p>
            </div>
          ) : null}
          {isEditing ? (
            <div className="space-y-2">
              <textarea
                className="min-h-20 w-full resize-none rounded-md border border-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-moss"
                maxLength={4000}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button className="h-8 px-2" variant="secondary" onClick={() => setIsEditing(false)}>
                  <X className="h-4 w-4" />
                </Button>
                <Button className="h-8 px-2" disabled={isSaving || !draft.trim()} onClick={saveEdit}>
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          ) : (
            <>
              {isDeleted ? (
                <p className="whitespace-pre-wrap break-words text-sm italic">This message was deleted.</p>
              ) : null}
              {!isDeleted && hasVoiceNote ? (
                <VoiceNotePlayer
                  durationMs={message.voiceDurationMs}
                  src={`/api/voice-notes/${voiceKind}/${message.id}`}
                />
              ) : null}
              {!isDeleted && message.body ? (
                <>
                  <p className={`whitespace-pre-wrap break-words text-sm ${hasVoiceNote ? "mt-2" : ""}`}>
                    {message.body}
                  </p>
                  <TranslateTextButton text={message.body} />
                </>
              ) : null}
              {!isDeleted && message.attachmentFile ? (
                <a
                  className="mt-2 inline-flex items-center gap-2 rounded-md border border-ink/10 bg-white px-2 py-1 text-xs text-moss"
                  href={`/api/files/${message.attachmentFile.id}/preview`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  {message.attachmentFile.fileName} ({formatBytes(message.attachmentFile.size)})
                </a>
              ) : null}
              <div className="mt-1 flex flex-wrap items-center justify-end gap-2 text-[11px] text-ink/45">
                {message.editedAt && !isDeleted ? <span>edited</span> : null}
                <span>{formatDate(message.createdAt)}</span>
                {isMine && readCount ? (
                  <span className="inline-flex items-center gap-0.5 text-moss" title={`Read by ${readCount}`}>
                    <CheckCheck className="h-3.5 w-3.5" />
                    {readCount}
                  </span>
                ) : null}
              </div>
              {!isDeleted && reactionGroups.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {reactionGroups.map((reaction) => (
                    <button
                      key={reaction.emoji}
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        reaction.selected ? "border-moss bg-mint" : "border-ink/10 bg-white"
                      }`}
                      type="button"
                      onClick={() => onReact?.(message.id, reaction.emoji)}
                    >
                      {reaction.emoji} {reaction.count}
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </div>
        {!isDeleted && !isEditing ? (
          <div className="absolute -top-3 right-2 hidden gap-1 rounded-full border border-ink/10 bg-white p-1 shadow-soft group-hover:flex">
            <button
              aria-label="Reply to message"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink/65 transition hover:bg-mint"
              type="button"
              onClick={() => onReply?.(message)}
            >
              <CornerUpLeft className="h-3.5 w-3.5" />
            </button>
            <button
              aria-label="React to message"
              className="group/reaction relative inline-flex h-7 w-7 items-center justify-center rounded-full text-ink/65 transition hover:bg-mint"
              type="button"
            >
              <SmilePlus className="h-3.5 w-3.5" />
              <span className="absolute bottom-8 right-0 hidden gap-1 rounded-full border border-ink/10 bg-white p-1 shadow-soft group-hover/reaction:flex">
                {["👍", "❤️", "😂", "🙏", "✅"].map((emoji) => (
                  <span
                    key={emoji}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-mint"
                    role="button"
                    tabIndex={0}
                    onClick={(event) => {
                      event.stopPropagation();
                      onReact?.(message.id, emoji);
                    }}
                  >
                    {emoji}
                  </span>
                ))}
              </span>
            </button>
            <button
              aria-label={bookmarked ? "Remove bookmark" : "Bookmark message"}
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-mint ${
                bookmarked ? "text-moss" : "text-ink/65"
              }`}
              type="button"
              onClick={() => onBookmark?.(message.id)}
            >
              <Bookmark className={`h-3.5 w-3.5 ${bookmarked ? "fill-current" : ""}`} />
            </button>
            <button
              aria-label={pinned ? "Unpin message" : "Pin message"}
              className={`inline-flex h-7 w-7 items-center justify-center rounded-full transition hover:bg-mint ${
                pinned ? "text-clay" : "text-ink/65"
              }`}
              type="button"
              onClick={() => onPin?.(message.id)}
            >
              <Pin className={`h-3.5 w-3.5 ${pinned ? "fill-current" : ""}`} />
            </button>
            <button
              aria-label="Forward message"
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink/65 transition hover:bg-mint"
              type="button"
              onClick={() => onForward?.(message)}
            >
              <Forward className="h-3.5 w-3.5" />
            </button>
            {canManage && canEdit ? (
              <button
                aria-label="Edit message"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink/65 transition hover:bg-mint hover:text-ink"
                type="button"
                onClick={() => {
                  setDraft(message.body);
                  setIsEditing(true);
                }}
              >
                <Edit3 className="h-3.5 w-3.5" />
              </button>
            ) : null}
            {canManage ? (
              <button
                aria-label="Delete message"
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink/65 transition hover:bg-clay/10 hover:text-clay disabled:cursor-not-allowed disabled:opacity-40"
                disabled={!canDelete || isDeleting}
                title={canDelete ? "Delete message" : "Deletion expires after 20 minutes"}
                type="button"
                onClick={deleteMessage}
              >
                {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
