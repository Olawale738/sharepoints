"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { AppLocale } from "@/lib/i18n";

export function LocaleSwitcher({ locale }: { locale: AppLocale }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function changeLocale(nextLocale: AppLocale) {
    setSaving(true);
    await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: nextLocale })
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <label className="inline-flex h-10 items-center gap-1 rounded-md px-2 text-sm text-ink hover:bg-ink/5">
      <Languages className="h-4 w-4" />
      <select
        aria-label="Interface language"
        className="max-w-20 bg-transparent text-xs outline-none"
        disabled={saving}
        value={locale}
        onChange={(event) => void changeLocale(event.target.value as AppLocale)}
      >
        <option value="en">English</option>
        <option value="yo">Yoruba</option>
        <option value="fr">Français</option>
      </select>
    </label>
  );
}
