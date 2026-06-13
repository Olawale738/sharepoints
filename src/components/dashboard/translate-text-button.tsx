"use client";

import { Languages, Loader2, X } from "lucide-react";
import { useState } from "react";

import { localeOptions, type AppLocale } from "@/lib/i18n";

export function TranslateTextButton({ text }: { text: string }) {
  const [language, setLanguage] = useState<AppLocale>("yo");
  const [translation, setTranslation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function translate() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, targetLanguage: language })
    });
    const body = (await response.json().catch(() => null)) as { translation?: string; error?: string } | null;
    setLoading(false);
    if (!response.ok || !body?.translation) {
      setError(body?.error ?? "Translation failed.");
      return;
    }
    setTranslation(body.translation);
  }

  return (
    <div className="mt-2 text-xs">
      <div className="flex items-center gap-1">
        <select
          aria-label="Translation language"
          className="h-7 max-w-32 rounded-md border border-ink/10 bg-white px-1 text-[11px]"
          value={language}
          onChange={(event) => setLanguage(event.target.value as AppLocale)}
        >
          {localeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-ink/55 hover:bg-mint hover:text-moss"
          disabled={loading}
          title="Translate this text"
          type="button"
          onClick={() => void translate()}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />}
          Translate
        </button>
      </div>
      {translation ? (
        <div className="mt-2 rounded-md border border-moss/15 bg-white/80 p-2 text-ink/70">
          <div className="flex items-start justify-between gap-2">
            <p className="whitespace-pre-wrap">{translation}</p>
            <button aria-label="Close translation" type="button" onClick={() => setTranslation("")}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ) : null}
      {error ? <p className="mt-1 text-clay">{error}</p> : null}
    </div>
  );
}
