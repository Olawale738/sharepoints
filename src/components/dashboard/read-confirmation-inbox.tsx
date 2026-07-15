"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, BookOpenCheck, Loader2, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

type OutstandingRead = {
  id: string;
  targetType: string;
  targetId: string;
  title: string;
  instructions?: string | null;
  dueAt?: string | null;
  href: string;
};

export function ReadConfirmationInbox() {
  const [items, setItems] = useState<OutstandingRead[]>([]);
  const [signatureNames, setSignatureNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const response = await fetch("/api/read-confirmations", { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as { outstanding?: OutstandingRead[]; error?: string } | null;
    setLoading(false);
    if (!response.ok) {
      setError(body?.error ?? "Read confirmations could not be loaded.");
      return;
    }
    setItems(body?.outstanding ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function confirm(item: OutstandingRead) {
    const signatureName = signatureNames[item.id]?.trim();
    if (!signatureName) {
      setError("Type your full name before confirming.");
      return;
    }
    setBusyId(item.id);
    setError("");
    setNotice("");
    const response = await fetch("/api/read-confirmations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ requirementId: item.id, signatureName })
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusyId("");
    if (!response.ok) {
      setError(body?.error ?? "Could not confirm this record.");
      return;
    }
    setNotice("Read confirmation recorded.");
    await load();
  }

  if (loading && !items.length) {
    return (
      <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
        <p className="flex items-center gap-2 text-sm text-ink/55">
          <Loader2 className="h-4 w-4 animate-spin text-moss" />
          Checking read confirmations...
        </p>
      </section>
    );
  }

  if (!items.length && !error && !notice) return null;

  return (
    <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <BookOpenCheck className="h-4 w-4 text-moss" />
            Read confirmations
          </p>
          <p className="mt-1 text-xs text-ink/55">Documents, policies, reports, letters, or announcements assigned for your acknowledgement.</p>
        </div>
        <Button className="h-9 px-3" variant="secondary" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      {error ? <p className="mt-3 rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
      {notice ? <p className="mt-3 rounded-md bg-mint px-3 py-2 text-sm text-moss">{notice}</p> : null}

      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div className="rounded-md border border-ink/10 bg-paper p-3" key={item.id}>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{item.targetType.toLowerCase().replaceAll("_", " ")}</Badge>
                  {item.dueAt ? <Badge className="bg-wheat">due {formatDate(item.dueAt)}</Badge> : null}
                </div>
                <p className="mt-2 font-medium text-ink">{item.title}</p>
                {item.instructions ? <p className="mt-1 text-sm leading-6 text-ink/60">{item.instructions}</p> : null}
              </div>
              <Link className="inline-flex h-9 items-center justify-center rounded-md border border-ink/10 bg-white px-3 text-sm font-medium text-ink hover:bg-mint/40" href={item.href} target="_blank">
                Open
              </Link>
            </div>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <Input
                value={signatureNames[item.id] ?? ""}
                onChange={(event) => setSignatureNames((current) => ({ ...current, [item.id]: event.target.value }))}
                placeholder="Type your full name"
              />
              <Button className="sm:w-40" onClick={() => void confirm(item)} disabled={busyId === item.id}>
                {busyId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                Confirm read
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
