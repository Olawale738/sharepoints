"use client";

import { FileLock2, Loader2, Plus, Trash2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type BoardRecord = {
  id: string;
  recordType: string;
  title: string;
  body: string;
  confidential: boolean;
  status: string;
  createdAt: string;
};
type BoardDecision = { id: string; recordId: string; title: string; outcome: string; ownerId?: string | null; dueAt?: string | null };
type UserOption = { id: string; name?: string | null; email?: string | null };
type UnitOption = { id: string; name: string; type: string };
type WorkspaceOption = { id: string; name: string };

type BoardData = {
  records: BoardRecord[];
  decisions: BoardDecision[];
  users: UserOption[];
  units: UnitOption[];
  workspaces: WorkspaceOption[];
};

const emptyData: BoardData = { records: [], decisions: [], users: [], units: [], workspaces: [] };

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function BoardPortalPanel() {
  const [data, setData] = useState<BoardData>(emptyData);
  const [mode, setMode] = useState<"BOARD_RECORD" | "BOARD_DECISION">("BOARD_RECORD");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const userName = useMemo(() => new Map(data.users.map((user) => [user.id, user.name ?? user.email ?? "Member"])), [data.users]);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/board");
    const body = (await response.json().catch(() => null)) as (BoardData & { error?: string }) | null;
    setLoading(false);
    if (!response.ok || !body) {
      setError(body?.error ?? "Board portal could not be loaded.");
      return;
    }
    setData(body);
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(mode);
    setError("");
    setNotice("");
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const payload: Record<string, unknown> = { entity: mode, ...values, confidential: values.confidential === "on" };
    for (const key of ["workspaceId", "organizationUnitId", "ownerId", "dueAt"]) {
      if (payload[key] === "") payload[key] = null;
    }
    if (payload.dueAt) payload.dueAt = new Date(String(payload.dueAt)).toISOString();
    const response = await fetch("/api/board", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(body?.error ?? "Board record could not be saved.");
      return;
    }
    form.reset();
    setNotice("Board portal updated.");
    await load();
  }

  async function update(id: string, status: string) {
    const response = await fetch("/api/board", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status })
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setError(body?.error ?? "Board record could not be updated.");
      return;
    }
    setNotice("Board status updated.");
    await load();
  }

  async function deleteRecord(id: string) {
    if (!confirm("Delete this private board record and its decisions?")) return;
    const response = await fetch("/api/board", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, confirmation: "DELETE BOARD RECORD" })
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setError(body?.error ?? "Board record could not be deleted.");
      return;
    }
    setNotice("Board record deleted.");
    await load();
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[24rem_minmax(0,1fr)]">
      <section className="rounded-lg border border-ink/10 bg-white p-4">
        <div className="flex gap-1 rounded-md bg-paper p-1">
          {(["BOARD_RECORD", "BOARD_DECISION"] as const).map((item) => (
            <button className={`flex-1 rounded-md px-3 py-2 text-sm font-medium ${mode === item ? "bg-white shadow-sm" : ""}`} key={item} type="button" onClick={() => setMode(item)}>
              {label(item)}
            </button>
          ))}
        </div>
        <form className="mt-4 space-y-3" onSubmit={create}>
          {mode === "BOARD_RECORD" ? (
            <>
              <select className="h-10 w-full rounded-md border border-ink/10 px-3 text-sm" name="recordType">
                {["MINUTES", "RESOLUTION", "LEGAL", "FINANCE", "APPROVAL", "DOCUMENT"].map((item) => <option key={item}>{item}</option>)}
              </select>
              <Input name="title" placeholder="Board record title" required />
              <select className="h-10 w-full rounded-md border border-ink/10 px-3 text-sm" name="organizationUnitId"><option value="">Organization-wide</option>{data.units.map((item) => <option key={item.id} value={item.id}>{item.type.toLowerCase()}: {item.name}</option>)}</select>
              <select className="h-10 w-full rounded-md border border-ink/10 px-3 text-sm" name="workspaceId"><option value="">No workspace</option>{data.workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <Textarea name="body" placeholder="Minutes, resolution, legal note, financial oversight, or approval details" required />
              <label className="flex items-center gap-2 text-sm"><input defaultChecked name="confidential" type="checkbox" /> Confidential board record</label>
            </>
          ) : (
            <>
              <select className="h-10 w-full rounded-md border border-ink/10 px-3 text-sm" name="recordId" required><option value="">Choose board record</option>{data.records.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
              <Input name="title" placeholder="Decision or action title" required />
              <select className="h-10 w-full rounded-md border border-ink/10 px-3 text-sm" name="ownerId"><option value="">No owner</option>{data.users.map((item) => <option key={item.id} value={item.id}>{item.name ?? item.email}</option>)}</select>
              <Input name="dueAt" type="datetime-local" />
              <Textarea name="outcome" placeholder="Decision outcome or action item" required />
            </>
          )}
          <Button className="w-full" disabled={Boolean(busy)} type="submit">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Save
          </Button>
        </form>
      </section>

      <section className="space-y-4">
        {notice ? <p className="rounded-md bg-mint px-4 py-3 text-sm text-moss">{notice}</p> : null}
        {error ? <p className="rounded-md bg-clay/10 px-4 py-3 text-sm text-clay">{error}</p> : null}
        {loading ? <p className="rounded-lg border border-ink/10 bg-white p-6 text-sm text-ink/55">Loading private board portal...</p> : null}
        {data.records.map((record) => (
          <article className="rounded-lg border border-ink/10 bg-white p-4" key={record.id}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-moss"><FileLock2 className="h-4 w-4" />{label(record.recordType)}</p>
                <h2 className="mt-1 text-xl font-semibold">{record.title}</h2>
              </div>
              <div className="flex items-center gap-2">
                <Badge>{label(record.status)}</Badge>
                <button className="inline-flex h-8 w-8 items-center justify-center rounded-md text-clay hover:bg-clay/10" type="button" onClick={() => void deleteRecord(record.id)}><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink/70">{record.body}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["REVIEW", "APPROVED", "ARCHIVED"].map((status) => <button className="rounded-md border border-ink/10 px-2 py-1 text-xs hover:bg-mint/50" key={status} type="button" onClick={() => void update(record.id, status)}>{label(status)}</button>)}
            </div>
            <div className="mt-4 rounded-md bg-paper p-3">
              <p className="text-sm font-medium">Decisions and action items</p>
              <div className="mt-2 space-y-2">
                {data.decisions.filter((item) => item.recordId === record.id).map((decision) => (
                  <p className="rounded-md bg-white px-3 py-2 text-sm" key={decision.id}>
                    <span className="font-medium">{decision.title}</span> - {decision.outcome}
                    {decision.ownerId ? <span className="text-ink/45"> - owner {userName.get(decision.ownerId)}</span> : null}
                  </p>
                ))}
              </div>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
