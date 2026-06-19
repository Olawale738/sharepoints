"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function ClearOrganizationActivityButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function clearAll() {
    if (!window.confirm("Clear every LETW activity log? A permanent security record of this action will remain.")) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/activity", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "CLEAR ALL LETW ACTIVITY" })
    });
    const result = (await response.json().catch(() => null)) as { count?: number; error?: string } | null;
    setBusy(false);
    if (!response.ok) {
      setMessage(result?.error ?? "Activity logs could not be cleared.");
      return;
    }
    setMessage(`${result?.count ?? 0} activity logs cleared.`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {message ? <span className="text-xs text-ink/50">{message}</span> : null}
      <Button className="h-9" variant="danger" disabled={busy} onClick={() => void clearAll()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        Clear all activity
      </Button>
    </div>
  );
}
