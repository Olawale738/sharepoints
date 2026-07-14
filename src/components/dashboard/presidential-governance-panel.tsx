"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Archive,
  BadgeCheck,
  ClipboardCheck,
  FileLock2,
  Gauge,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Trash2
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type GovernanceControl = {
  type: string;
  label: string;
  detail: string;
  severity: string;
};

type GovernanceRecord = {
  id: string;
  controlType: string;
  title: string;
  summary: string;
  status: string;
  severity: string;
  dueAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

type GovernanceData = {
  controls: GovernanceControl[];
  records: GovernanceRecord[];
  stats: Record<string, number>;
};

const emptyData: GovernanceData = { controls: [], records: [], stats: {} };

const statusClass: Record<string, string> = {
  ACTIVE: "bg-mint text-moss",
  PENDING_REVIEW: "bg-wheat text-ink",
  RESOLVED: "bg-paper text-ink",
  ARCHIVED: "bg-ink/10 text-ink",
  REVOKED: "bg-clay/10 text-clay"
};

function labelFor(type: string, controls: GovernanceControl[]) {
  return controls.find((control) => control.type === type)?.label ?? type.replaceAll("_", " ").toLowerCase();
}

export function PresidentialGovernancePanel() {
  const [data, setData] = useState<GovernanceData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const filteredRecords = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return data.records;
    return data.records.filter((record) =>
      [record.title, record.summary, record.controlType, record.status, record.severity, labelFor(record.controlType, data.controls)]
        .join(" ")
        .toLowerCase()
        .includes(value)
    );
  }, [data.controls, data.records, query]);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/admin/presidential-governance");
    const body = (await response.json().catch(() => null)) as (GovernanceData & { error?: string }) | null;
    setLoading(false);
    if (!response.ok || !body) {
      setError(body?.error ?? "Presidential governance center could not be loaded.");
      return;
    }
    setData(body);
  }

  useEffect(() => {
    void load();
  }, []);

  async function post(payload: Record<string, unknown>, message: string) {
    setBusy(String(payload.action ?? "post"));
    setNotice("");
    setError("");
    const response = await fetch("/api/admin/presidential-governance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = (await response.json().catch(() => null)) as { error?: string; result?: { count?: number } } | null;
    setBusy("");
    if (!response.ok) {
      setError(body?.error ?? "Governance action failed.");
      return;
    }
    setNotice(body?.result?.count !== undefined ? `${message} ${body.result.count} record(s) affected.` : message);
    await load();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = Object.fromEntries(formData.entries()) as Record<string, unknown>;
    for (const [key, value] of Object.entries(payload)) {
      if (value === "") payload[key] = null;
    }
    if (typeof payload.dueAt === "string" && payload.dueAt) {
      payload.dueAt = new Date(payload.dueAt).toISOString();
    }
    await post({ action: "CREATE_RECORD", ...payload }, "Governance control created.");
    form.reset();
  }

  async function patch(id: string, status: string) {
    setBusy(`${id}-${status}`);
    setNotice("");
    setError("");
    const response = await fetch("/api/admin/presidential-governance", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status })
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(body?.error ?? "Update failed.");
      return;
    }
    setNotice("Governance control updated.");
    await load();
  }

  async function remove(id: string) {
    setBusy(`${id}-delete`);
    setNotice("");
    setError("");
    const response = await fetch("/api/admin/presidential-governance", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(body?.error ?? "Delete failed.");
      return;
    }
    setNotice("Governance control deleted.");
    await load();
  }

  return (
    <div className="space-y-6">
      {notice ? <p className="rounded-md border border-moss/15 bg-mint px-4 py-3 text-sm text-moss">{notice}</p> : null}
      {error ? <p className="rounded-md bg-clay/10 px-4 py-3 text-sm text-clay">{error}</p> : null}

      <section className="grid gap-4 md:grid-cols-4">
        <Metric icon={<ShieldCheck className="h-5 w-5" />} label="Active controls" value={data.stats.activeControls ?? 0} />
        <Metric icon={<AlertTriangle className="h-5 w-5" />} label="Critical open" value={data.stats.criticalControls ?? 0} />
        <Metric icon={<FileLock2 className="h-5 w-5" />} label="Sensitive files" value={data.stats.sensitiveFiles ?? 0} />
        <Metric icon={<Gauge className="h-5 w-5" />} label="Leaders covered" value={data.stats.leaders ?? 0} />
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Info label="Document exposure checks" value={(data.stats.restrictedFiles ?? 0) + (data.stats.liveShareLinks ?? 0)} />
        <Info label="Leadership risks" value={(data.stats.pendingDecisions ?? 0) + (data.stats.pendingHandovers ?? 0)} />
        <Info label="Official credentials" value={(data.stats.activeCards ?? 0) + (data.stats.activeCertificates ?? 0) + (data.stats.issuedLetters ?? 0)} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <ClipboardCheck className="h-5 w-5 text-moss" />
            Create governance control
          </h2>
          <p className="mt-1 text-sm text-ink/55">Create controls for policy, locks, risk, redaction, credentials, incidents, circulars, privacy, and more.</p>
          <form className="mt-5 space-y-4" onSubmit={(event) => void submit(event)}>
            <select className="h-11 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" name="controlType" required>
              <option value="">Choose control area</option>
              {data.controls.map((control) => (
                <option key={control.type} value={control.type}>{control.label}</option>
              ))}
            </select>
            <Input name="title" placeholder="Control title" required />
            <Textarea name="summary" placeholder="What this control protects, who owns it, and how it should be reviewed" required />
            <div className="grid gap-3 sm:grid-cols-3">
              <select className="h-11 rounded-md border border-ink/10 bg-white px-3 text-sm" name="status" defaultValue="ACTIVE">
                <option value="ACTIVE">Active</option>
                <option value="PENDING_REVIEW">Pending review</option>
                <option value="RESOLVED">Resolved</option>
                <option value="ARCHIVED">Archived</option>
              </select>
              <select className="h-11 rounded-md border border-ink/10 bg-white px-3 text-sm" name="severity" defaultValue="HIGH">
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
              <Input name="dueAt" type="datetime-local" />
            </div>
            <Button className="w-full" disabled={Boolean(busy)} type="submit">
              {busy === "CREATE_RECORD" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
              Create control
            </Button>
          </form>
        </div>

        <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <ShieldAlert className="h-5 w-5 text-moss" />
            Activate all 12 controls
          </h2>
          <p className="mt-1 text-sm leading-6 text-ink/55">
            This creates one baseline active record for every requested control area that does not already have an open record.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {data.controls.map((control) => (
              <div className="rounded-md border border-ink/10 bg-paper p-3" key={control.type}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-ink">{control.label}</p>
                  <Badge className={control.severity === "CRITICAL" ? "bg-clay/10 text-clay" : control.severity === "HIGH" ? "bg-wheat text-ink" : "bg-mint text-moss"}>
                    {control.severity.toLowerCase()}
                  </Badge>
                </div>
                <p className="mt-1 text-xs leading-5 text-ink/55">{control.detail}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button disabled={Boolean(busy)} onClick={() => void post({ action: "ACTIVATE_BASELINE_CONTROLS" }, "Baseline controls activated.")}>
              {busy === "ACTIVATE_BASELINE_CONTROLS" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Activate missing controls
            </Button>
            <Button variant="danger" disabled={Boolean(busy)} onClick={() => void post({ action: "CLEAR_GOVERNANCE_LOGS", confirmation: "CLEAR GOVERNANCE LOGS" }, "Governance logs cleared.")}>
              {busy === "CLEAR_GOVERNANCE_LOGS" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Clear governance logs
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-ink/10 bg-white shadow-soft">
        <div className="flex flex-col gap-3 border-b border-ink/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">Governance register</h2>
            <p className="text-sm text-ink/55">Active locks, policies, alerts, credentials, incidents, circulars, and privacy controls.</p>
          </div>
          <Input className="sm:max-w-xs" value={query} placeholder="Search governance records" onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="divide-y divide-ink/10">
          {loading ? <p className="flex items-center gap-2 p-6 text-sm text-ink/55"><Loader2 className="h-4 w-4 animate-spin" />Loading governance records</p> : null}
          {!loading && !filteredRecords.length ? <p className="p-6 text-sm text-ink/55">No governance records found.</p> : null}
          {filteredRecords.map((record) => (
            <article className="p-5" key={record.id}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-ink">{record.title}</h3>
                    <Badge className={statusClass[record.status] ?? "bg-paper"}>{record.status.replaceAll("_", " ").toLowerCase()}</Badge>
                    <Badge>{record.severity.toLowerCase()}</Badge>
                  </div>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-moss">{labelFor(record.controlType, data.controls)}</p>
                  <p className="mt-2 max-w-4xl text-sm leading-6 text-ink/65">{record.summary}</p>
                  <p className="mt-3 text-xs text-ink/45">
                    Updated {new Date(record.updatedAt).toLocaleString()}
                    {record.dueAt ? ` - due ${new Date(record.dueAt).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void patch(record.id, "RESOLVED")}>
                    {busy === `${record.id}-RESOLVED` ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                    Resolve
                  </Button>
                  <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void patch(record.id, "ARCHIVED")}>
                    {busy === `${record.id}-ARCHIVED` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                    Archive
                  </Button>
                  <Button variant="danger" disabled={Boolean(busy)} onClick={() => void remove(record.id)}>
                    {busy === `${record.id}-delete` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Delete
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
      <div className="text-moss">{icon}</div>
      <p className="mt-3 text-2xl font-semibold text-ink">{value}</p>
      <p className="text-sm text-ink/55">{label}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-paper p-4">
      <p className="text-2xl font-semibold text-ink">{value}</p>
      <p className="text-sm text-ink/55">{label}</p>
    </div>
  );
}
