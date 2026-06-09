"use client";

import { useState } from "react";
import { Check, Edit3, Loader2, Paperclip, Trash2, X } from "lucide-react";

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
  onMessageChange: (message: BubbleMessage) => void;
  onError: (message: string) => void;
};

function authorName(message: BubbleMessage) {
  return message.author?.name ?? message.author?.email ?? message.externalAuthor ?? "Webhook";
}

export function ChatMessageBubble({
  currentUserId,
  message,
  endpoint,
  onMessageChange,
  onError
}: ChatMessageBubbleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const isMine = Boolean(message.author?.id && message.author.id === currentUserId);
  const isDeleted = Boolean(message.deletedAt);
  const canEdit = isMine && !isDeleted;
  const canDelete = canEdit && Date.now() - new Date(message.createdAt).getTime() <= messageDeleteWindowMs;
  const bubbleTone = isDeleted ? "bg-white/75 text-ink/55" : isMine ? "bg-mint text-ink" : "bg-white text-ink";

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
              <p className={`whitespace-pre-wrap break-words text-sm ${isDeleted ? "italic" : ""}`}>
                {isDeleted ? "This message was deleted." : message.body}
              </p>
              {!isDeleted && message.attachmentFile ? (
                <a
                  className="mt-2 inline-flex items-center gap-2 rounded-md border border-ink/10 bg-white px-2 py-1 text-xs text-moss"
                  href={`/api/files/${message.attachmentFile.id}/download`}
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  {message.attachmentFile.fileName} ({formatBytes(message.attachmentFile.size)})
                </a>
              ) : null}
              <div className="mt-1 flex flex-wrap items-center justify-end gap-2 text-[11px] text-ink/45">
                {message.editedAt && !isDeleted ? <span>edited</span> : null}
                <span>{formatDate(message.createdAt)}</span>
              </div>
            </>
          )}
        </div>
        {canEdit && !isEditing ? (
          <div className="absolute -top-3 right-2 hidden gap-1 rounded-full border border-ink/10 bg-white p-1 shadow-soft group-hover:flex">
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
          </div>
        ) : null}
      </div>
    </article>
  );
}
