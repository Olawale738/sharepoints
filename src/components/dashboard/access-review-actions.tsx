"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, RotateCw, ShieldOff, Trash2, UserMinus } from "lucide-react";

import { Button } from "@/components/ui/button";

type AccessReviewAction =
  | { action: "CONFIRM_WORKSPACE_MEMBER"; memberId: string }
  | { action: "REMOVE_WORKSPACE_MEMBER"; memberId: string }
  | { action: "DELETE_SHARE_LINK"; shareLinkId: string }
  | { action: "DISABLE_AI_AGENT"; agentId: string }
  | { action: "REVOKE_DEVICE"; deviceId: string }
  | { action: "CLEAR_ACCESS_REVIEW_LOGS" };

const icons = {
  CONFIRM_WORKSPACE_MEMBER: RotateCw,
  REMOVE_WORKSPACE_MEMBER: UserMinus,
  DELETE_SHARE_LINK: Trash2,
  DISABLE_AI_AGENT: ShieldOff,
  REVOKE_DEVICE: ShieldOff,
  CLEAR_ACCESS_REVIEW_LOGS: RotateCw
};

export function AccessReviewActionButton({
  payload,
  label,
  confirmText,
  variant = "secondary"
}: {
  payload: AccessReviewAction;
  label: string;
  confirmText?: string;
  variant?: "secondary" | "danger";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const Icon = icons[payload.action];

  async function runAction() {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    setError("");
    const response = await fetch("/api/admin/access-review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);

    if (!response.ok) {
      setError(body?.error ?? "Access review action failed.");
      return;
    }

    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Button className="h-9" disabled={busy} variant={variant} onClick={runAction}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
        {label}
      </Button>
      {error ? <p className="text-xs text-clay">{error}</p> : null}
    </div>
  );
}
