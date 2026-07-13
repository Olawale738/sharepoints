"use client";

import { Loader2, RotateCcw, ShieldOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type SealRegistryActionsProps = {
  active: boolean;
  kind: string;
  recordId?: string | null;
};

export function SealRegistryActions({ active, kind, recordId }: SealRegistryActionsProps) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  async function run(action: "REVOKE" | "REISSUE") {
    if (!recordId) return;
    setBusy(action);
    setError("");
    const response = await fetch("/api/admin/seal-registry", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, recordId, action })
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(body?.error ?? "Seal action failed.");
      return;
    }
    router.refresh();
  }

  if (!recordId || kind === "UNKNOWN") return null;

  return (
    <div className="flex flex-col gap-2 lg:items-end">
      {error ? <p className="max-w-36 text-right text-xs text-clay">{error}</p> : null}
      {active ? (
        <Button className="h-8 px-3 text-xs" disabled={Boolean(busy)} variant="danger" onClick={() => void run("REVOKE")}>
          {busy === "REVOKE" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldOff className="h-3.5 w-3.5" />}
          Revoke
        </Button>
      ) : (
        <Button className="h-8 px-3 text-xs" disabled={Boolean(busy)} variant="secondary" onClick={() => void run("REISSUE")}>
          {busy === "REISSUE" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          Reissue
        </Button>
      )}
    </div>
  );
}
