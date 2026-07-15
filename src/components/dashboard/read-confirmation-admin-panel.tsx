"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpenCheck, Loader2, RefreshCw, Send, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";

type TargetType = "FILE" | "POLICY" | "ANNOUNCEMENT" | "OFFICIAL_LETTER" | "MONTHLY_REPORT";
type TargetOption = { id: string; title: string; detail: string };
type UserOption = { id: string; name?: string | null; email?: string | null };
type Requirement = {
  id: string;
  targetType: TargetType;
  title: string;
  audienceLabel: string;
  audienceCount: number;
  confirmedCount: number;
  outstandingCount: number;
  dueAt?: string | null;
  active: boolean;
  createdAt: string;
};
type CenterData = {
  users: UserOption[];
  targets: Record<TargetType, TargetOption[]>;
  requirements: Requirement[];
};

const targetLabels: Record<TargetType, string> = {
  FILE: "File",
  POLICY: "Policy",
  ANNOUNCEMENT: "Announcement",
  OFFICIAL_LETTER: "Official letter",
  MONTHLY_REPORT: "Monthly report"
};

export function ReadConfirmationAdminPanel() {
  const [data, setData] = useState<CenterData | null>(null);
  const [targetType, setTargetType] = useState<TargetType>("FILE");
  const [targetId, setTargetId] = useState("");
  const [audienceMode, setAudienceMode] = useState("TARGET_WORKSPACE");
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [dueAt, setDueAt] = useState("");
  const [instructions, setInstructions] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const response = await fetch("/api/admin/read-confirmations", { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as (CenterData & { error?: string }) | null;
    setLoading(false);
    if (!response.ok || !body) {
      setError(body?.error ?? "Read confirmation center could not be loaded.");
      return;
    }
    setData(body);
    if (!targetId && body.targets[targetType]?.[0]) setTargetId(body.targets[targetType][0].id);
  }, [targetId, targetType]);

  useEffect(() => {
    void load();
  }, [load]);

  const targetOptions = useMemo(() => data?.targets[targetType] ?? [], [data?.targets, targetType]);

  async function createRequirement() {
    setBusy("CREATE");
    setError("");
    setNotice("");
    const response = await fetch("/api/admin/read-confirmations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType,
        targetId,
        audienceMode,
        userIds: selectedUsers,
        dueAt: dueAt ? new Date(dueAt).toISOString() : null,
        instructions: instructions || null
      })
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(body?.error ?? "Could not create read confirmation.");
      return;
    }
    setNotice("Read confirmation requirement created and notifications sent.");
    await load();
  }

  async function deactivate(id: string) {
    if (!window.confirm("Deactivate this read confirmation requirement?")) return;
    setBusy(id);
    setError("");
    setNotice("");
    const response = await fetch("/api/admin/read-confirmations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "DEACTIVATE", id })
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(body?.error ?? "Could not deactivate requirement.");
      return;
    }
    setNotice("Read confirmation requirement deactivated.");
    await load();
  }

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-md bg-clay/10 px-4 py-3 text-sm text-clay">{error}</p> : null}
      {notice ? <p className="rounded-md border border-moss/15 bg-mint px-4 py-3 text-sm text-moss">{notice}</p> : null}

      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-moss">
              <BookOpenCheck className="h-4 w-4" />
              Document read accountability
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">Require confirmation</h2>
            <p className="mt-1 text-sm leading-6 text-ink/60">Assign a document, policy, announcement, letter, or report for members/leaders to open and sign as read.</p>
          </div>
          <Button variant="secondary" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          <select
            className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm"
            value={targetType}
            onChange={(event) => {
              const nextType = event.target.value as TargetType;
              setTargetType(nextType);
              setTargetId(data?.targets[nextType]?.[0]?.id ?? "");
            }}
          >
            {(Object.keys(targetLabels) as TargetType[]).map((type) => <option key={type} value={type}>{targetLabels[type]}</option>)}
          </select>
          <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" value={targetId} onChange={(event) => setTargetId(event.target.value)}>
            {targetOptions.map((target) => (
              <option key={target.id} value={target.id}>{target.title} - {target.detail}</option>
            ))}
          </select>
          <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" value={audienceMode} onChange={(event) => setAudienceMode(event.target.value)}>
            <option value="TARGET_WORKSPACE">Target workspace members</option>
            <option value="POLICY_ASSIGNMENTS">Policy assigned members</option>
            <option value="ORGANIZATION">All active LETW members</option>
            <option value="SELECTED">Selected members only</option>
          </select>
          <Input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
        </div>

        {audienceMode === "SELECTED" ? (
          <div className="mt-3 grid max-h-48 gap-2 overflow-y-auto rounded-md border border-ink/10 bg-paper p-3 sm:grid-cols-2 lg:grid-cols-3">
            {(data?.users ?? []).map((user) => (
              <label className="flex items-center gap-2 text-sm" key={user.id}>
                <input
                  className="h-4 w-4 accent-moss"
                  type="checkbox"
                  checked={selectedUsers.includes(user.id)}
                  onChange={(event) => setSelectedUsers((current) => event.target.checked ? [...new Set([...current, user.id])] : current.filter((id) => id !== user.id))}
                />
                {user.name ?? user.email}
              </label>
            ))}
          </div>
        ) : null}

        <Textarea className="mt-3" value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Optional instruction shown to readers" />
        <Button className="mt-3" disabled={Boolean(busy) || !targetId} onClick={() => void createRequirement()}>
          {busy === "CREATE" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Require confirmation
        </Button>
      </section>

      <section className="rounded-lg border border-ink/10 bg-white shadow-soft">
        <div className="border-b border-ink/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Active and recent requirements</h2>
        </div>
        <div className="divide-y divide-ink/10">
          {data?.requirements.length ? data.requirements.map((item) => (
            <div className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between" key={item.id}>
              <div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{item.targetType.toLowerCase().replaceAll("_", " ")}</Badge>
                  <Badge className={item.active ? "bg-mint" : "bg-paper"}>{item.active ? "active" : "inactive"}</Badge>
                  {item.dueAt ? <Badge className="bg-wheat">due {formatDate(item.dueAt)}</Badge> : null}
                </div>
                <p className="mt-2 text-sm font-medium text-ink">{item.title}</p>
                <p className="mt-1 text-xs text-ink/55">
                  {item.audienceLabel} - {item.confirmedCount}/{item.audienceCount} confirmed - {item.outstandingCount} outstanding
                </p>
              </div>
              {item.active ? (
                <Button className="h-9" variant="danger" disabled={busy === item.id} onClick={() => void deactivate(item.id)}>
                  {busy === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                  Deactivate
                </Button>
              ) : null}
            </div>
          )) : <p className="px-4 py-8 text-sm text-ink/55">No read confirmation requirements yet.</p>}
        </div>
      </section>
    </div>
  );
}
