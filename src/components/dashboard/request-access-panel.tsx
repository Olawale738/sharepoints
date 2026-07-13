"use client";

import { FormEvent, useState } from "react";
import { KeyRound, Loader2, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type RequestAccessPanelProps = {
  targetType: "WORKSPACE" | "FILE";
  targetId: string;
  title: string;
  description: string;
  existingStatus?: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" | null;
};

export function RequestAccessPanel({
  targetType,
  targetId,
  title,
  description,
  existingStatus
}: RequestAccessPanelProps) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState(existingStatus ?? "");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    const response = await fetch("/api/access-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType,
        targetId,
        requestedRole: "VIEWER",
        reason
      })
    });
    const body = (await response.json().catch(() => null)) as {
      request?: { status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" };
      error?: string;
    } | null;
    setBusy(false);

    if (!response.ok || !body?.request) {
      setError(body?.error ?? "Access request could not be sent.");
      return;
    }

    setStatus(body.request.status);
    setReason("");
  }

  return (
    <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-moss">
            <KeyRound className="h-4 w-4" />
            Request access
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-ink">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/60">{description}</p>
        </div>
        {status ? <Badge className={status === "PENDING" ? "bg-wheat" : status === "APPROVED" ? "bg-mint" : "bg-paper"}>{status.toLowerCase()}</Badge> : null}
      </div>

      {error ? <p className="mt-4 rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
      {status === "PENDING" ? (
        <p className="mt-4 rounded-md bg-wheat/70 px-3 py-2 text-sm text-ink">
          Your request is waiting for a workspace admin or authorized leader to review it.
        </p>
      ) : null}
      {status === "APPROVED" ? (
        <p className="mt-4 rounded-md bg-mint px-3 py-2 text-sm text-ink">
          Your access has been approved. Refresh the dashboard or open the link again.
        </p>
      ) : null}

      {!status || status === "REJECTED" || status === "CANCELLED" ? (
        <form className="mt-4 space-y-3" onSubmit={submit}>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Optional note for the reviewer"
          />
          <Button disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send access request
          </Button>
        </form>
      ) : null}
    </section>
  );
}
