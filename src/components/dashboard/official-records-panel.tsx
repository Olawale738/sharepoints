"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRightLeft,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Megaphone,
  QrCode,
  ShieldCheck,
  Stamp,
  Trash2
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";

type UserOption = {
  id: string;
  name: string | null;
  email: string | null;
  category: string | null;
  memberProfile: { organizationPosition: string | null; membershipNumber: string | null } | null;
};

type UnitOption = {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  countryCode: string | null;
  code: string | null;
};

type WorkspaceOption = {
  id: string;
  name: string;
};

type PastorTransfer = {
  id: string;
  transferNumber: string;
  sealNumber: string;
  verifyToken: string;
  pastorUserId: string;
  fromOrganizationUnitId: string | null;
  toOrganizationUnitId: string | null;
  fromWorkspaceId: string | null;
  toWorkspaceId: string | null;
  title: string;
  reason: string | null;
  effectiveAt: string;
  handoverDueAt: string | null;
  handoverChecklist: unknown;
  housingNeeds: string | null;
  resourceNeeds: string | null;
  branchAssignmentHistory: unknown;
  status: string;
  approvedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
};

type Circular = {
  id: string;
  circularNumber: string;
  sealNumber: string;
  verifyToken: string;
  title: string;
  summary: string;
  body: string;
  category: string;
  audienceType: string;
  audienceLabel: string;
  workspaceId: string | null;
  organizationUnitId: string | null;
  requiresAcknowledgement: boolean;
  status: string;
  issuedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type Acknowledgement = {
  id: string;
  circularId: string;
  organizationUnitId: string | null;
  workspaceId: string | null;
  userId: string | null;
  acknowledgedById: string | null;
  status: string;
  note: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
};

type OfficialRecordsData = {
  users: UserOption[];
  units: UnitOption[];
  workspaces: WorkspaceOption[];
  transfers: PastorTransfer[];
  circulars: Circular[];
  acknowledgements: Acknowledgement[];
  metrics: {
    activeTransfers: number;
    pendingHandovers: number;
    issuedCirculars: number;
    pendingAcknowledgements: number;
  };
};

type ErrorPayload = {
  error?: string;
};

const selectClass = "h-10 rounded-md border border-ink/10 bg-white px-3 text-sm text-ink outline-none focus:ring-2 focus:ring-moss";
const statusClass: Record<string, string> = {
  ACTIVE: "bg-mint text-moss",
  APPROVED: "bg-mint text-moss",
  COMPLETED: "bg-mint text-moss",
  ISSUED: "bg-mint text-moss",
  ACKNOWLEDGED: "bg-mint text-moss",
  DRAFT: "bg-paper text-ink",
  PENDING_HANDOVER: "bg-wheat text-ink",
  PENDING: "bg-wheat text-ink",
  CANCELLED: "bg-clay text-white",
  REVOKED: "bg-clay text-white",
  EXPIRED: "bg-clay text-white",
  ARCHIVED: "bg-ink text-white",
  REPLACED: "bg-ink text-white"
};

function localDateTimeToIso(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  return new Date(text).toISOString();
}

function labelOfUser(user?: UserOption) {
  if (!user) return "Unknown LETW user";
  const role = user.memberProfile?.organizationPosition ?? user.category;
  return `${user.name ?? user.email ?? "LETW user"}${role ? ` - ${role}` : ""}`;
}

function labelOfUnit(unit?: UnitOption | null) {
  if (!unit) return "";
  return `${unit.name} - ${unit.type.toLowerCase()}${unit.countryCode ? ` - ${unit.countryCode}` : ""}`;
}

function labelOfWorkspace(workspace?: WorkspaceOption | null) {
  return workspace?.name ?? "Not selected";
}

function asLines(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function verifyUrl(path: "transfer" | "circular", token: string) {
  return `/verify/${path}/${token}`;
}

function isErrorPayload(payload: OfficialRecordsData | ErrorPayload | null): payload is ErrorPayload {
  return Boolean(payload && "error" in payload);
}

export function OfficialRecordsPanel() {
  const [data, setData] = useState<OfficialRecordsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");

  async function load() {
    setLoading(true);
    const response = await fetch("/api/admin/official-records", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as OfficialRecordsData | { error?: string } | null;
    const payloadIsError = isErrorPayload(payload);
    const errorMessage = payloadIsError ? payload.error : null;
    if (!response.ok || !payload || payloadIsError) {
      setNotice(errorMessage ?? "Official records could not load.");
      setLoading(false);
      return;
    }
    setData(payload);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const usersById = useMemo(() => new Map((data?.users ?? []).map((user) => [user.id, user])), [data?.users]);
  const unitsById = useMemo(() => new Map((data?.units ?? []).map((unit) => [unit.id, unit])), [data?.units]);
  const workspacesById = useMemo(() => new Map((data?.workspaces ?? []).map((workspace) => [workspace.id, workspace])), [data?.workspaces]);

  async function post(payload: Record<string, unknown>, success: string, form?: HTMLFormElement) {
    setBusy(String(payload.entity ?? "POST"));
    setNotice("");
    const response = await fetch("/api/admin/official-records", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setNotice(result?.error ?? "Official record action failed.");
      setBusy("");
      return;
    }
    form?.reset();
    setNotice(success);
    await load();
    setBusy("");
  }

  async function patch(payload: Record<string, unknown>, success: string) {
    setBusy(`${payload.entity}:${payload.id}:${payload.status}`);
    setNotice("");
    const response = await fetch("/api/admin/official-records", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setNotice(result?.error ?? "Official record update failed.");
      setBusy("");
      return;
    }
    setNotice(success);
    await load();
    setBusy("");
  }

  async function remove(payload: Record<string, unknown>, success: string) {
    if (!window.confirm("Delete this official record? This removes it from the management board.")) return;
    setBusy(`DELETE:${payload.id}`);
    setNotice("");
    const response = await fetch("/api/admin/official-records", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setNotice(result?.error ?? "Official record delete failed.");
      setBusy("");
      return;
    }
    setNotice(success);
    await load();
    setBusy("");
  }

  function createTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const effectiveAt = localDateTimeToIso(formData.get("effectiveAt"));
    if (!effectiveAt) {
      setNotice("Choose an effective date for the transfer.");
      return;
    }
    void post(
      {
        entity: "PASTOR_TRANSFER",
        pastorUserId: String(formData.get("pastorUserId")),
        fromOrganizationUnitId: String(formData.get("fromOrganizationUnitId") || "") || null,
        toOrganizationUnitId: String(formData.get("toOrganizationUnitId") || "") || null,
        fromWorkspaceId: String(formData.get("fromWorkspaceId") || "") || null,
        toWorkspaceId: String(formData.get("toWorkspaceId") || "") || null,
        title: String(formData.get("title") || ""),
        reason: String(formData.get("reason") || "") || null,
        effectiveAt,
        handoverDueAt: localDateTimeToIso(formData.get("handoverDueAt")),
        handoverChecklist: String(formData.get("handoverChecklist") || ""),
        housingNeeds: String(formData.get("housingNeeds") || "") || null,
        resourceNeeds: String(formData.get("resourceNeeds") || "") || null,
        branchAssignmentHistory: String(formData.get("branchAssignmentHistory") || ""),
        issueNow: formData.get("issueNow") === "on"
      },
      "Pastor transfer/posting created.",
      form
    );
  }

  function createCircular(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    void post(
      {
        entity: "CIRCULAR",
        title: String(formData.get("title") || ""),
        summary: String(formData.get("summary") || ""),
        body: String(formData.get("body") || ""),
        category: String(formData.get("category") || "LEADERSHIP"),
        audienceType: String(formData.get("audienceType") || "SELECTED_UNITS"),
        audienceLabel: String(formData.get("audienceLabel") || "Selected LETW leaders and branches"),
        workspaceId: String(formData.get("workspaceId") || "") || null,
        organizationUnitId: String(formData.get("organizationUnitId") || "") || null,
        expiresAt: localDateTimeToIso(formData.get("expiresAt")),
        requiresAcknowledgement: formData.get("requiresAcknowledgement") === "on",
        issueNow: formData.get("issueNow") === "on"
      },
      "Official circular created.",
      form
    );
  }

  if (loading) {
    return (
      <div className="rounded-lg border border-ink/10 bg-white p-6 shadow-soft">
        <p className="flex items-center gap-2 text-sm text-ink/60"><Loader2 className="h-4 w-4 animate-spin" />Loading official records...</p>
      </div>
    );
  }

  if (!data) {
    return <div className="rounded-lg border border-clay/20 bg-clay/10 p-4 text-sm text-clay">{notice || "Official records unavailable."}</div>;
  }

  return (
    <div className="space-y-6">
      {notice ? <div className="rounded-lg border border-ink/10 bg-white px-4 py-3 text-sm text-ink shadow-soft">{notice}</div> : null}

      <section className="grid gap-4 md:grid-cols-4">
        <Metric icon={<ArrowRightLeft className="h-5 w-5" />} label="Active postings" value={data.metrics.activeTransfers} />
        <Metric icon={<CheckCircle2 className="h-5 w-5" />} label="Pending handovers" value={data.metrics.pendingHandovers} />
        <Metric icon={<Megaphone className="h-5 w-5" />} label="Issued circulars" value={data.metrics.issuedCirculars} />
        <Metric icon={<ShieldCheck className="h-5 w-5" />} label="Pending acknowledgements" value={data.metrics.pendingAcknowledgements} />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <form className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft" onSubmit={createTransfer}>
          <p className="flex items-center gap-2 text-sm font-medium text-moss"><ArrowRightLeft className="h-4 w-4" />Pastor Transfer & Posting Board</p>
          <h2 className="mt-2 text-xl font-semibold text-ink">Create pastor transfer/posting</h2>
          <div className="mt-4 grid gap-3">
            <label className="space-y-1 text-sm font-medium text-ink">
              Pastor / leader
              <select className={selectClass} name="pastorUserId" required>
                <option value="">Select pastor or leader</option>
                {data.users.map((user) => <option key={user.id} value={user.id}>{labelOfUser(user)}</option>)}
              </select>
            </label>
            <Input name="title" placeholder="Transfer title, e.g. Lagos Region pastoral posting" required />
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 text-sm font-medium text-ink">
                From branch/region/church
                <select className={selectClass} name="fromOrganizationUnitId">
                  <option value="">No unit</option>
                  {data.units.map((unit) => <option key={unit.id} value={unit.id}>{labelOfUnit(unit)}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-ink">
                To branch/region/church
                <select className={selectClass} name="toOrganizationUnitId">
                  <option value="">No unit</option>
                  {data.units.map((unit) => <option key={unit.id} value={unit.id}>{labelOfUnit(unit)}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-ink">
                From workspace
                <select className={selectClass} name="fromWorkspaceId">
                  <option value="">No workspace</option>
                  {data.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-ink">
                To workspace
                <select className={selectClass} name="toWorkspaceId">
                  <option value="">No workspace</option>
                  {data.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-ink">
                Effective date
                <Input name="effectiveAt" type="datetime-local" required />
              </label>
              <label className="space-y-1 text-sm font-medium text-ink">
                Handover due
                <Input name="handoverDueAt" type="datetime-local" />
              </label>
            </div>
            <Textarea name="reason" placeholder="Reason for transfer/posting" />
            <Textarea name="handoverChecklist" placeholder="Handover checklist, one item per line: keys, documents, reports, passwords, pending matters..." />
            <Textarea name="housingNeeds" placeholder="Housing or accommodation needs" />
            <Textarea name="resourceNeeds" placeholder="Resource needs: vehicle, equipment, assistant, office, documents..." />
            <Textarea name="branchAssignmentHistory" placeholder="Branch assignment history, one entry per line" />
            <label className="flex items-center gap-2 text-sm text-ink/70">
              <input name="issueNow" type="checkbox" />
              Approve immediately
            </label>
            <Button disabled={busy === "PASTOR_TRANSFER"} type="submit">
              {busy === "PASTOR_TRANSFER" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
              Create posting
            </Button>
          </div>
        </form>

        <form className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft" onSubmit={createCircular}>
          <p className="flex items-center gap-2 text-sm font-medium text-moss"><Megaphone className="h-4 w-4" />Official Circular System</p>
          <h2 className="mt-2 text-xl font-semibold text-ink">Create official circular</h2>
          <div className="mt-4 grid gap-3">
            <Input name="title" placeholder="Circular title" required />
            <Input name="category" placeholder="Category, e.g. Leadership, Policy, Emergency, Academic" defaultValue="LEADERSHIP" />
            <Textarea name="summary" placeholder="Public-safe summary" required />
            <Textarea name="body" placeholder="Full circular body / instruction" required />
            <div className="grid gap-3 md:grid-cols-2">
              <Input name="audienceType" placeholder="Audience type" defaultValue="SELECTED_UNITS" />
              <Input name="audienceLabel" placeholder="Audience label" defaultValue="Selected LETW leaders and branches" />
              <label className="space-y-1 text-sm font-medium text-ink">
                Branch/region/ministry
                <select className={selectClass} name="organizationUnitId">
                  <option value="">LETW-wide or no unit</option>
                  {data.units.map((unit) => <option key={unit.id} value={unit.id}>{labelOfUnit(unit)}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-ink">
                Workspace
                <select className={selectClass} name="workspaceId">
                  <option value="">No workspace</option>
                  {data.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-ink">
                Expiry date
                <Input name="expiresAt" type="datetime-local" />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink/70">
              <input name="requiresAcknowledgement" type="checkbox" defaultChecked />
              Require branch/workspace acknowledgement
            </label>
            <label className="flex items-center gap-2 text-sm text-ink/70">
              <input name="issueNow" type="checkbox" defaultChecked />
              Issue immediately
            </label>
            <Button disabled={busy === "CIRCULAR"} type="submit">
              {busy === "CIRCULAR" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
              Create circular
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss"><ArrowRightLeft className="h-4 w-4" />Transfer board</p>
            <h2 className="mt-1 text-xl font-semibold text-ink">Pastor transfer and posting records</h2>
          </div>
          <a className="inline-flex h-10 items-center gap-2 rounded-md border border-ink/10 bg-white px-3 text-sm font-medium hover:bg-mint/40" href="/verify" target="_blank" rel="noreferrer">
            <ShieldCheck className="h-4 w-4" />Open scanner
          </a>
        </div>
        <div className="mt-4 divide-y divide-ink/10">
          {data.transfers.length === 0 ? <p className="py-8 text-sm text-ink/55">No pastor transfer or posting records yet.</p> : null}
          {data.transfers.map((transfer) => (
            <article className="grid gap-4 py-4 lg:grid-cols-[1fr_9rem] lg:items-start" key={transfer.id}>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-ink">{transfer.title}</h3>
                  <Badge className={statusClass[transfer.status] ?? "bg-paper"}>{transfer.status.toLowerCase().replaceAll("_", " ")}</Badge>
                </div>
                <p className="mt-1 text-sm text-ink/60">
                  {labelOfUser(usersById.get(transfer.pastorUserId))} - effective {formatDate(transfer.effectiveAt)}
                </p>
                <p className="mt-1 text-sm text-ink/60">
                  From {labelOfUnit(unitsById.get(transfer.fromOrganizationUnitId ?? "")) || labelOfWorkspace(workspacesById.get(transfer.fromWorkspaceId ?? ""))} to{" "}
                  {labelOfUnit(unitsById.get(transfer.toOrganizationUnitId ?? "")) || labelOfWorkspace(workspacesById.get(transfer.toWorkspaceId ?? ""))}
                </p>
                <p className="mt-2 text-xs text-ink/45">{transfer.transferNumber} - {transfer.sealNumber}</p>
                {transfer.reason ? <p className="mt-2 text-sm leading-6 text-ink/65">{transfer.reason}</p> : null}
                {asLines(transfer.handoverChecklist).length ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink/65">
                    {asLines(transfer.handoverChecklist).slice(0, 5).map((item) => <li key={item}>{item}</li>)}
                  </ul>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {["PENDING_HANDOVER", "APPROVED", "ACTIVE", "COMPLETED", "CANCELLED"].map((status) => (
                    <Button
                      className="h-8 px-3 text-xs"
                      disabled={busy === `PASTOR_TRANSFER:${transfer.id}:${status}`}
                      key={status}
                      variant={status === "CANCELLED" ? "danger" : "secondary"}
                      onClick={() => void patch({ entity: "PASTOR_TRANSFER", id: transfer.id, status }, "Pastor transfer updated.")}
                    >
                      {status.toLowerCase().replaceAll("_", " ")}
                    </Button>
                  ))}
                  <a className="inline-flex h-8 items-center gap-2 rounded-md border border-ink/10 px-3 text-xs font-medium hover:bg-mint/40" href={verifyUrl("transfer", transfer.verifyToken)} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-3.5 w-3.5" />Verify
                  </a>
                  <Button className="h-8 px-3 text-xs" variant="danger" onClick={() => void remove({ entity: "PASTOR_TRANSFER", id: transfer.id }, "Pastor transfer deleted.")}>
                    <Trash2 className="h-3.5 w-3.5" />Delete
                  </Button>
                </div>
              </div>
              <div className="rounded-lg border border-ink/10 bg-paper p-2 text-center">
                <Image alt={`${transfer.transferNumber} QR`} className="mx-auto h-28 w-28 bg-white p-1" height={112} src={`/api/admin/official-records/transfers/${transfer.id}/qr`} unoptimized width={112} />
                <p className="mt-1 text-[10px] font-semibold text-ink/60">QR verification</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-moss"><Megaphone className="h-4 w-4" />Circular register</p>
          <h2 className="mt-1 text-xl font-semibold text-ink">Official circulars and acknowledgements</h2>
        </div>
        <div className="mt-4 divide-y divide-ink/10">
          {data.circulars.length === 0 ? <p className="py-8 text-sm text-ink/55">No official circulars yet.</p> : null}
          {data.circulars.map((circular) => {
            const circularAcknowledgements = data.acknowledgements.filter((item) => item.circularId === circular.id);
            return (
              <article className="grid gap-4 py-4 lg:grid-cols-[1fr_9rem] lg:items-start" key={circular.id}>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-ink">{circular.title}</h3>
                    <Badge className={statusClass[circular.status] ?? "bg-paper"}>{circular.status.toLowerCase()}</Badge>
                    <Badge className="bg-paper">{circular.category}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink/60">{circular.audienceLabel}</p>
                  <p className="mt-2 text-sm leading-6 text-ink/65">{circular.summary}</p>
                  <p className="mt-2 text-xs text-ink/45">{circular.circularNumber} - {circular.sealNumber}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {["ISSUED", "EXPIRED", "REVOKED", "ARCHIVED"].map((status) => (
                      <Button
                        className="h-8 px-3 text-xs"
                        disabled={busy === `CIRCULAR:${circular.id}:${status}`}
                        key={status}
                        variant={status === "REVOKED" ? "danger" : "secondary"}
                        onClick={() => void patch({ entity: "CIRCULAR", id: circular.id, status }, "Official circular updated.")}
                      >
                        {status.toLowerCase()}
                      </Button>
                    ))}
                    <a className="inline-flex h-8 items-center gap-2 rounded-md border border-ink/10 px-3 text-xs font-medium hover:bg-mint/40" href={verifyUrl("circular", circular.verifyToken)} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />Verify
                    </a>
                    <Button className="h-8 px-3 text-xs" variant="danger" onClick={() => void remove({ entity: "CIRCULAR", id: circular.id }, "Official circular deleted.")}>
                      <Trash2 className="h-3.5 w-3.5" />Delete
                    </Button>
                  </div>
                  {circularAcknowledgements.length ? (
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {circularAcknowledgements.map((ack) => (
                        <div className="rounded-md border border-ink/10 bg-paper p-3" key={ack.id}>
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-ink">
                              {labelOfUnit(unitsById.get(ack.organizationUnitId ?? "")) || labelOfWorkspace(workspacesById.get(ack.workspaceId ?? "")) || "LETW-wide acknowledgement"}
                            </p>
                            <Badge className={statusClass[ack.status] ?? "bg-paper"}>{ack.status.toLowerCase()}</Badge>
                          </div>
                          <p className="mt-1 text-xs text-ink/55">
                            {ack.acknowledgedAt ? `Acknowledged ${formatDate(ack.acknowledgedAt)}` : `Created ${formatDate(ack.createdAt)}`}
                          </p>
                          {ack.status !== "ACKNOWLEDGED" ? (
                            <Button
                              className="mt-2 h-8 px-3 text-xs"
                              variant="secondary"
                              onClick={() => void post({ entity: "CIRCULAR_ACKNOWLEDGEMENT", acknowledgementId: ack.id, note: "Acknowledged from official records board." }, "Circular acknowledged.")}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />Acknowledge
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="rounded-lg border border-ink/10 bg-paper p-2 text-center">
                  <Image alt={`${circular.circularNumber} QR`} className="mx-auto h-28 w-28 bg-white p-1" height={112} src={`/api/admin/official-records/circulars/${circular.id}/qr`} unoptimized width={112} />
                  <p className="mt-1 text-[10px] font-semibold text-ink/60">QR verification</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="rounded-lg border border-[#d4af37]/35 bg-[#fffaf0] p-5">
        <p className="flex items-center gap-2 text-sm font-semibold text-[#0b1b3d]"><Stamp className="h-4 w-4" />Official seal rule</p>
        <p className="mt-2 text-sm leading-6 text-ink/65">
          Every LETW transfer/posting and circular created here receives a serial number, seal number, QR verification URL, current status, and audit log. A printed or copied instruction should be accepted only when the public verification page confirms it is active.
        </p>
      </section>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
      <div className="text-moss">{icon}</div>
      <p className="mt-4 text-2xl font-semibold text-ink">{value}</p>
      <p className="text-sm text-ink/55">{label}</p>
    </div>
  );
}
