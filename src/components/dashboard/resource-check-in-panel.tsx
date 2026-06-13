"use client";

import { CheckCircle2, Loader2, LogIn, LogOut } from "lucide-react";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function ResourceCheckInPanel({ initialToken }: { initialToken: string }) {
  const [token, setToken] = useState(initialToken);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ action: string; resource: { name: string } } | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    const response = await fetch("/api/resources/check-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, note: note || null })
    });
    const body = (await response.json().catch(() => null)) as {
      action?: string;
      resource?: { name: string };
      error?: string;
    } | null;
    setBusy(false);
    if (!response.ok || !body?.action || !body.resource) {
      setError(body?.error ?? "Resource check-in failed.");
      return;
    }
    setResult({ action: body.action, resource: body.resource });
  }

  return (
    <section className="mx-auto max-w-xl rounded-lg border border-ink/10 bg-white p-5">
      {result ? (
        <div className="mb-4 rounded-md bg-mint p-4 text-sm text-moss">
          <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" />{result.action === "CHECKED_IN" ? "Checked in" : "Checked out"}</p>
          <p className="mt-1">{result.resource.name}</p>
        </div>
      ) : null}
      {error ? <p className="mb-4 rounded-md bg-clay/10 px-4 py-3 text-sm text-clay">{error}</p> : null}
      <form className="space-y-3" onSubmit={submit}>
        <Input placeholder="Resource QR token" required value={token} onChange={(event) => setToken(event.target.value)} />
        <Textarea placeholder="Optional condition or handover note" value={note} onChange={(event) => setNote(event.target.value)} />
        <Button className="w-full" disabled={busy} type="submit">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : result?.action === "CHECKED_IN" ? <LogOut className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
          Record resource access
        </Button>
      </form>
    </section>
  );
}
