"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function ClearAiAuditButton({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function clearAudits() {
    const confirmation = window.prompt('Type "CLEAR AI ACCESS AUDIT" to clear all AI audit records.');
    if (confirmation !== "CLEAR AI ACCESS AUDIT") return;

    setBusy(true);
    setMessage("");
    setError("");
    const response = await fetch("/api/admin/ai-audits", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation })
    });
    const body = (await response.json().catch(() => null)) as { count?: number; error?: string } | null;
    setBusy(false);
    if (!response.ok) {
      setError(body?.error ?? "AI access audit could not be cleared.");
      return;
    }
    setMessage(`${body?.count ?? 0} AI audit records cleared.`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {message ? <span className="text-xs text-moss">{message}</span> : null}
      {error ? <span className="text-xs text-clay">{error}</span> : null}
      <Button className="h-9" disabled={busy || disabled} variant="danger" onClick={() => void clearAudits()}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
        Clear AI audit
      </Button>
    </div>
  );
}
