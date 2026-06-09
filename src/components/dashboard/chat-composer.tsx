"use client";

import { KeyboardEvent } from "react";
import { Loader2, Send, SmilePlus } from "lucide-react";

import { Button } from "@/components/ui/button";

const quickEmojis = ["👍", "🙏", "✅", "❤️", "😂", "🔥", "👏", "🎉", "🙌", "😊"];

type ChatComposerProps = {
  value: string;
  placeholder: string;
  disabled?: boolean;
  isSending?: boolean;
  onChange: (value: string) => void;
  onSend: () => void;
};

export function ChatComposer({ value, placeholder, disabled, isSending, onChange, onSend }: ChatComposerProps) {
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend();
    }
  }

  function insertEmoji(emoji: string) {
    onChange(`${value}${emoji}`);
  }

  return (
    <div className="rounded-lg border border-ink/10 bg-white p-2 shadow-soft">
      <div className="mb-2 flex flex-wrap items-center gap-1">
        <SmilePlus className="mr-1 h-4 w-4 text-moss" />
        {quickEmojis.map((emoji) => (
          <button
            key={emoji}
            aria-label={`Insert ${emoji}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-base transition hover:bg-mint disabled:pointer-events-none disabled:opacity-50"
            disabled={disabled}
            type="button"
            onClick={() => insertEmoji(emoji)}
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="flex items-end gap-2">
        <textarea
          className="min-h-11 flex-1 resize-none rounded-md border border-ink/10 bg-paper px-3 py-2 text-sm outline-none transition placeholder:text-ink/40 focus:border-moss disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
          maxLength={4000}
          placeholder={placeholder}
          rows={1}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <Button className="h-11 shrink-0" disabled={disabled || isSending || !value.trim()} onClick={onSend}>
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Send
        </Button>
      </div>
    </div>
  );
}
