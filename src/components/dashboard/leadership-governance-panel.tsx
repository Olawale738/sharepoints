"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState, type ReactNode } from "react";
import {
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Download,
  Eye,
  FileText,
  KeyRound,
  Loader2,
  LockKeyhole,
  Mail,
  ShieldCheck
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";

type WorkspaceOption = {
  id: string;
  name: string;
};

type UnitOption = {
  id: string;
  name: string;
  type: string;
  countryCode: string | null;
  code: string | null;
};

type UserOption = {
  id: string;
  name: string | null;
  email: string | null;
  category: string | null;
  memberProfile: { organizationPosition: string | null; membershipNumber: string | null } | null;
};

type Decision = {
  id: string;
  title: string;
  description: string;
  source: string;
  status: string;
  meetingNotes: string | null;
  attachments: unknown;
  responsibleUserId: string | null;
  dueAt: string | null;
  createdAt: string;
};

type MonthlyReport = {
  id: string;
  title: string;
  month: number;
  year: number;
  status: string;
  summary: string;
  metrics: Record<string, unknown>;
  risks: unknown;
  createdAt: string;
};

type VaultRecord = {
  id: string;
  title: string;
  recordType: string;
  subjectName: string;
  status: string;
  sensitivity: string;
  assignedToId: string | null;
  createdAt: string;
  updatedAt: string;
};

type OpenVaultRecord = VaultRecord & {
  body: string;
  prayerPoints: string | null;
};

type VaultLog = {
  id: string;
  recordId: string;
  userId: string;
  action: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
};

type Handover = {
  id: string;
  title: string;
  reason: string | null;
  duties: unknown;
  documents: unknown;
  passwordAssets: unknown;
  pendingTasks: unknown;
  branchRecords: unknown;
  status: string;
  fromLeaderId: string;
  toLeaderId: string | null;
  createdAt: string;
};

type OfficialLetter = {
  id: string;
  letterType: string;
  letterNumber: string;
  title: string;
  recipientName: string;
  recipientEmail: string | null;
  body: string;
  signatureName: string;
  status: string;
  issuedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type GovernanceData = {
  access: {
    isAdmin: boolean;
    canOpenVault: boolean;
  };
  workspaces: WorkspaceOption[];
  units: UnitOption[];
  users: UserOption[];
  decisions: Decision[];
  reports: MonthlyReport[];
  vaultRecords: VaultRecord[];
  vaultLogs: VaultLog[];
  handovers: Handover[];
  letters: OfficialLetter[];
  metrics: {
    pendingDecisions: number;
    reports: number;
    openVaultRecords: number;
    pendingHandovers: number;
    issuedLetters: number;
  };
};

const tabs = ["Decisions", "Reports", "Vault", "Handovers", "Letters"] as const;

function emptyToNull(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

function localToIso(value: FormDataEntryValue | null) {
  const text = String(value ?? "");
  return text ? new Date(text).toISOString() : null;
}

function jsonLines(value: unknown) {
  if (!value) return "None recorded";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "None recorded";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

async function jsonRequest<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(data?.error ?? "Request failed.");
  return data as T;
}

function FieldSelect({
  name,
  label,
  children,
  defaultValue
}: {
  name: string;
  label: string;
  children: ReactNode;
  defaultValue?: string;
}) {
  return (
    <label className="text-xs font-medium text-ink/60">
      {label}
      <select name={name} className="mt-1 h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm text-ink" defaultValue={defaultValue}>
        {children}
      </select>
    </label>
  );
}

function MetricCard({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4">
      <p className="text-2xl font-semibold text-ink">{value}</p>
      <p className="text-sm text-ink/55">{label}</p>
      <p className="mt-1 text-xs text-ink/40">{detail}</p>
    </div>
  );
}

export function LeadershipGovernancePanel({ initialData }: { initialData: GovernanceData }) {
  const [data, setData] = useState(initialData);
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Decisions");
  const [loading, setLoading] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [openVault, setOpenVault] = useState<OpenVaultRecord | null>(null);

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const userName = useMemo(() => {
    const names = new Map<string, string>();
    data.users.forEach((user) => names.set(user.id, user.name ?? user.email ?? "Unknown user"));
    return names;
  }, [data.users]);

  async function refresh() {
    const next = await jsonRequest<GovernanceData>("/api/leadership-governance");
    setData(next);
  }

  async function createEntity(event: FormEvent<HTMLFormElement>, entity: string, payload: Record<string, unknown>, success: string) {
    event.preventDefault();
    setLoading(entity);
    setError("");
    setMessage("");
    try {
      await jsonRequest("/api/leadership-governance", {
        method: "POST",
        body: JSON.stringify({ entity, ...payload })
      });
      event.currentTarget.reset();
      await refresh();
      setMessage(success);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Request failed.");
    } finally {
      setLoading("");
    }
  }

  async function patchEntity(entity: string, id: string, status: string, success: string) {
    setLoading(`${entity}-${id}-${status}`);
    setError("");
    setMessage("");
    try {
      await jsonRequest("/api/leadership-governance", {
        method: "PATCH",
        body: JSON.stringify({ entity, id, status })
      });
      await refresh();
      setMessage(success);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Update failed.");
    } finally {
      setLoading("");
    }
  }

  async function openVaultRecord(id: string) {
    setLoading(`vault-open-${id}`);
    setError("");
    try {
      const result = await jsonRequest<{ record: OpenVaultRecord }>(`/api/leadership-governance/vault/${id}`);
      setOpenVault(result.record);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Vault record could not be opened.");
    } finally {
      setLoading("");
    }
  }

  async function createDecision(event: FormEvent<HTMLFormElement>) {
    const form = new FormData(event.currentTarget);
    await createEntity(event, "DECISION", {
      source: String(form.get("source")),
      title: String(form.get("title")),
      description: String(form.get("description")),
      meetingNotes: emptyToNull(form.get("meetingNotes")),
      attachments: emptyToNull(form.get("attachments")),
      responsibleUserId: emptyToNull(form.get("responsibleUserId")),
      decidedById: emptyToNull(form.get("decidedById")),
      workspaceId: emptyToNull(form.get("workspaceId")),
      organizationUnitId: emptyToNull(form.get("organizationUnitId")),
      dueAt: localToIso(form.get("dueAt"))
    }, "Leadership decision saved and audited.");
  }

  async function submitMonthlyReport(formElement: HTMLFormElement, pack = false) {
    const form = new FormData(formElement);
    const fakeEvent = {
      preventDefault: () => undefined,
      currentTarget: formElement
    } as FormEvent<HTMLFormElement>;
    await createEntity(fakeEvent, pack ? "MONTHLY_REPORT_PACK" : "MONTHLY_REPORT", {
      month: Number(form.get("month") || currentMonth),
      year: Number(form.get("year") || currentYear),
      workspaceId: pack ? undefined : emptyToNull(form.get("workspaceId")),
      organizationUnitId: pack ? undefined : emptyToNull(form.get("organizationUnitId"))
    }, pack ? "Monthly report pack generated for branches, churches, and ministries." : "Monthly report generated.");
  }

  async function createMonthlyReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitMonthlyReport(event.currentTarget);
  }

  async function createVaultRecord(event: FormEvent<HTMLFormElement>) {
    const form = new FormData(event.currentTarget);
    await createEntity(event, "VAULT_RECORD", {
      recordType: String(form.get("recordType")),
      title: String(form.get("title")),
      subjectName: String(form.get("subjectName")),
      subjectUserId: emptyToNull(form.get("subjectUserId")),
      body: String(form.get("body")),
      prayerPoints: emptyToNull(form.get("prayerPoints")),
      assignedToId: emptyToNull(form.get("assignedToId")),
      workspaceId: emptyToNull(form.get("workspaceId")),
      organizationUnitId: emptyToNull(form.get("organizationUnitId"))
    }, "Confidential vault record created. Every open is now audited.");
  }

  async function createHandover(event: FormEvent<HTMLFormElement>) {
    const form = new FormData(event.currentTarget);
    await createEntity(event, "HANDOVER", {
      fromLeaderId: String(form.get("fromLeaderId")),
      toLeaderId: emptyToNull(form.get("toLeaderId")),
      title: String(form.get("title")),
      reason: emptyToNull(form.get("reason")),
      duties: emptyToNull(form.get("duties")),
      documents: emptyToNull(form.get("documents")),
      passwordAssets: emptyToNull(form.get("passwordAssets")),
      pendingTasks: emptyToNull(form.get("pendingTasks")),
      branchRecords: emptyToNull(form.get("branchRecords")),
      workspaceId: emptyToNull(form.get("workspaceId")),
      organizationUnitId: emptyToNull(form.get("organizationUnitId"))
    }, "Leadership handover pack created and leaders notified.");
  }

  async function createLetter(event: FormEvent<HTMLFormElement>) {
    const form = new FormData(event.currentTarget);
    await createEntity(event, "OFFICIAL_LETTER", {
      letterType: String(form.get("letterType")),
      title: String(form.get("title")),
      recipientUserId: emptyToNull(form.get("recipientUserId")),
      recipientName: String(form.get("recipientName")),
      recipientEmail: emptyToNull(form.get("recipientEmail")),
      body: String(form.get("body")),
      signatureName: emptyToNull(form.get("signatureName")),
      workspaceId: emptyToNull(form.get("workspaceId")),
      organizationUnitId: emptyToNull(form.get("organizationUnitId")),
      issueNow: form.get("issueNow") === "on"
    }, "Official LETW letter generated.");
  }

  const optionLists = (
    <>
      <FieldSelect name="workspaceId" label="Workspace scope">
        <option value="">No workspace</option>
        {data.workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
        ))}
      </FieldSelect>
      <FieldSelect name="organizationUnitId" label="Branch / ministry scope">
        <option value="">No branch/ministry</option>
        {data.units.map((unit) => (
          <option key={unit.id} value={unit.id}>
            {unit.name} - {unit.type.toLowerCase()} {unit.countryCode ? `(${unit.countryCode})` : ""}
          </option>
        ))}
      </FieldSelect>
    </>
  );

  const userOptions = data.users.map((user) => (
    <option key={user.id} value={user.id}>
      {user.name ?? user.email} {user.memberProfile?.organizationPosition ? `- ${user.memberProfile.organizationPosition}` : ""}
    </option>
  ));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <ShieldCheck className="h-4 w-4" />
              Leadership governance
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Decision, report, vault, handover, and letter center</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-ink/60">
              Track leadership decisions, generate monthly branch/ministry reports, protect confidential prayer and counselling records,
              complete formal handovers, and issue official LETW letters with downloadable PDFs.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-ink/10 bg-paper px-4 text-sm font-medium text-ink hover:bg-mint/40" href="/dashboard/leadership">
              <BarChart3 className="h-4 w-4" />
              Leadership suite
            </Link>
            <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-ink/10 bg-paper px-4 text-sm font-medium text-ink hover:bg-mint/40" href="/dashboard/admin">
              <ShieldCheck className="h-4 w-4" />
              Admin center
            </Link>
          </div>
        </div>
        {message ? <p className="mt-4 rounded-md bg-mint px-3 py-2 text-sm text-ink">{message}</p> : null}
        {error ? <p className="mt-4 rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Pending decisions" value={data.metrics.pendingDecisions} detail="Pending or delayed" />
        <MetricCard label="Monthly reports" value={data.metrics.reports} detail="Generated packs" />
        <MetricCard label="Open vault records" value={data.metrics.openVaultRecords} detail="Restricted pastoral records" />
        <MetricCard label="Pending handovers" value={data.metrics.pendingHandovers} detail="Transfers/replacements" />
        <MetricCard label="Issued letters" value={data.metrics.issuedLetters} detail="Active official letters" />
      </section>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            className={activeTab === tab ? "rounded-md bg-moss px-3 py-2 text-sm font-medium text-white" : "rounded-md border border-ink/10 bg-white px-3 py-2 text-sm font-medium text-ink hover:bg-mint/40"}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Decisions" ? (
        <section className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <form className="rounded-lg border border-ink/10 bg-white p-4" onSubmit={(event) => void createDecision(event)}>
            <p className="flex items-center gap-2 text-sm font-semibold text-ink"><ClipboardCheck className="h-4 w-4 text-moss" />New leadership decision</p>
            <div className="mt-4 space-y-3">
              <FieldSelect name="source" label="Decision source" defaultValue="PRESIDENT">
                <option value="PRESIDENT">President</option>
                <option value="PASTORS">Pastors</option>
                <option value="LEADERS">Leaders</option>
                <option value="BOARD">Board</option>
                <option value="COMMITTEE">Committee</option>
              </FieldSelect>
              <Input name="title" placeholder="Decision title" required />
              <Textarea name="description" placeholder="Decision details" required />
              <Textarea name="meetingNotes" placeholder="Meeting notes or minutes summary" />
              <Textarea name="attachments" placeholder="File links or document references, one per line" />
              <FieldSelect name="responsibleUserId" label="Responsible person">
                <option value="">Not assigned</option>
                {userOptions}
              </FieldSelect>
              <FieldSelect name="decidedById" label="Decided by">
                <option value="">Not selected</option>
                {userOptions}
              </FieldSelect>
              {optionLists}
              <Input name="dueAt" type="datetime-local" />
              <Button type="submit" disabled={Boolean(loading)}>
                {loading === "DECISION" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Save decision
              </Button>
            </div>
          </form>
          <div className="space-y-3">
            {data.decisions.map((decision) => (
              <div className="rounded-lg border border-ink/10 bg-white p-4" key={decision.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{decision.title}</p>
                    <p className="mt-1 text-xs text-ink/50">{decision.source.toLowerCase()} - {decision.dueAt ? `due ${formatDate(decision.dueAt)}` : "no deadline"}</p>
                  </div>
                  <Badge>{decision.status.toLowerCase()}</Badge>
                </div>
                <p className="mt-3 text-sm leading-6 text-ink/65">{decision.description}</p>
                {decision.meetingNotes ? <p className="mt-2 rounded-md bg-paper p-3 text-xs text-ink/55">{decision.meetingNotes}</p> : null}
                <p className="mt-2 text-xs text-ink/45">Responsible: {decision.responsibleUserId ? userName.get(decision.responsibleUserId) : "Not assigned"}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["APPROVED", "IMPLEMENTED", "DELAYED", "CANCELLED"].map((status) => (
                    <Button className="h-8 px-3 text-xs" key={status} variant={status === "CANCELLED" ? "danger" : "secondary"} onClick={() => void patchEntity("DECISION", decision.id, status, `Decision marked ${status.toLowerCase()}.`)}>
                      {status.toLowerCase()}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            {data.decisions.length === 0 ? <p className="rounded-lg border border-ink/10 bg-white p-8 text-sm text-ink/55">No leadership decisions have been logged yet.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === "Reports" ? (
        <section className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <form className="rounded-lg border border-ink/10 bg-white p-4" onSubmit={(event) => void createMonthlyReport(event)}>
            <p className="flex items-center gap-2 text-sm font-semibold text-ink"><BarChart3 className="h-4 w-4 text-moss" />Monthly auto report pack</p>
            <p className="mt-2 text-xs leading-5 text-ink/55">Reports include attendance, souls won/new converts, baptisms, giving, projects, follow-ups, events, documents, decisions, and risks.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Input name="month" type="number" min={1} max={12} defaultValue={currentMonth} required />
              <Input name="year" type="number" min={2000} max={2100} defaultValue={currentYear} required />
            </div>
            <div className="mt-3 space-y-3">{optionLists}</div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="submit" disabled={Boolean(loading)}>
                {loading === "MONTHLY_REPORT" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BarChart3 className="h-4 w-4" />}
                Generate one report
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={(event) => {
                  const form = event.currentTarget.form;
                  if (form) void submitMonthlyReport(form, true);
                }}
                disabled={Boolean(loading)}
              >
                Generate full pack
              </Button>
            </div>
          </form>
          <div className="space-y-3">
            {data.reports.map((report) => (
              <div className="rounded-lg border border-ink/10 bg-white p-4" key={report.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{report.title}</p>
                    <p className="mt-1 text-xs text-ink/50">{report.year}-{String(report.month).padStart(2, "0")} - created {formatDate(report.createdAt)}</p>
                  </div>
                  <Badge>{report.status.toLowerCase()}</Badge>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink/65">{report.summary}</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {Object.entries(report.metrics ?? {}).slice(0, 9).map(([key, value]) => (
                    <p className="rounded-md bg-paper px-3 py-2 text-xs text-ink/60" key={key}>
                      <span className="block font-semibold text-ink">{String(value)}</span>
                      {key.replace(/([A-Z])/g, " $1").toLowerCase()}
                    </p>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-ink/10 bg-paper px-3 text-xs font-medium text-ink hover:bg-mint/40" href={`/api/leadership-governance/reports/${report.id}/pdf`}>
                    <Download className="h-3.5 w-3.5" />
                    PDF
                  </Link>
                  {["FINAL", "ARCHIVED"].map((status) => (
                    <Button className="h-8 px-3 text-xs" key={status} variant="secondary" onClick={() => void patchEntity("MONTHLY_REPORT", report.id, status, `Report marked ${status.toLowerCase()}.`)}>
                      {status.toLowerCase()}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            {data.reports.length === 0 ? <p className="rounded-lg border border-ink/10 bg-white p-8 text-sm text-ink/55">No monthly reports generated yet.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === "Vault" ? (
        <section className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
          {data.access.canOpenVault ? (
            <form className="rounded-lg border border-ink/10 bg-white p-4" onSubmit={(event) => void createVaultRecord(event)}>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink"><LockKeyhole className="h-4 w-4 text-moss" />Confidential prayer and counselling vault</p>
              <p className="mt-2 text-xs leading-5 text-ink/55">Extremely restricted. Every time a record is opened, LETW stores who opened it, when, IP, and browser details.</p>
              <div className="mt-4 space-y-3">
                <FieldSelect name="recordType" label="Record type" defaultValue="PRAYER">
                  <option value="PRAYER">Prayer</option>
                  <option value="COUNSELLING">Counselling</option>
                  <option value="SAFEGUARDING">Safeguarding</option>
                </FieldSelect>
                <Input name="title" placeholder="Record title" required />
                <Input name="subjectName" placeholder="Subject/member name" required />
                <FieldSelect name="subjectUserId" label="Linked member">
                  <option value="">No linked member</option>
                  {userOptions}
                </FieldSelect>
                <FieldSelect name="assignedToId" label="Assigned pastor/leader">
                  <option value="">Not assigned</option>
                  {userOptions}
                </FieldSelect>
                {optionLists}
                <Textarea name="body" placeholder="Highly confidential notes" required />
                <Textarea name="prayerPoints" placeholder="Prayer points / follow-up guidance" />
                <Button type="submit" disabled={Boolean(loading)}>
                  {loading === "VAULT_RECORD" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
                  Save restricted record
                </Button>
              </div>
            </form>
          ) : (
            <div className="rounded-lg border border-ink/10 bg-white p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink"><LockKeyhole className="h-4 w-4 text-moss" />Vault restricted</p>
              <p className="mt-2 text-sm leading-6 text-ink/55">Only authorized top pastors and administrators can open confidential prayer, counselling, and safeguarding records.</p>
            </div>
          )}
          <div className="space-y-3">
            {openVault ? (
              <div className="rounded-lg border border-moss/30 bg-mint/25 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-moss">Opened and audited</p>
                <h2 className="mt-1 text-lg font-semibold text-ink">{openVault.title}</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink/70">{openVault.body}</p>
                {openVault.prayerPoints ? <p className="mt-3 rounded-md bg-white p-3 text-sm text-ink/60">{openVault.prayerPoints}</p> : null}
              </div>
            ) : null}
            {data.vaultRecords.map((record) => (
              <div className="rounded-lg border border-ink/10 bg-white p-4" key={record.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{record.title}</p>
                    <p className="mt-1 text-xs text-ink/50">{record.recordType.toLowerCase()} - {record.subjectName} - {record.sensitivity}</p>
                  </div>
                  <Badge>{record.status.toLowerCase()}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button className="h-8 px-3 text-xs" variant="secondary" onClick={() => void openVaultRecord(record.id)}>
                    {loading === `vault-open-${record.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
                    Open
                  </Button>
                  {["ACTIVE", "CLOSED", "ARCHIVED"].map((status) => (
                    <Button className="h-8 px-3 text-xs" key={status} variant="secondary" onClick={() => void patchEntity("VAULT_RECORD", record.id, status, `Vault record marked ${status.toLowerCase()}.`)}>
                      {status.toLowerCase()}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            {data.vaultRecords.length === 0 ? <p className="rounded-lg border border-ink/10 bg-white p-8 text-sm text-ink/55">No confidential vault records in your authorized scope.</p> : null}
            {data.access.canOpenVault ? (
              <div className="rounded-lg border border-ink/10 bg-white p-4">
                <p className="text-sm font-semibold text-ink">Recent vault access audit</p>
                <div className="mt-2 divide-y divide-ink/10">
                  {data.vaultLogs.slice(0, 8).map((log) => (
                    <p className="py-2 text-xs text-ink/55" key={log.id}>
                      {userName.get(log.userId) ?? "Unknown user"} opened record {log.recordId.slice(-6)} on {formatDate(log.createdAt)}
                    </p>
                  ))}
                  {data.vaultLogs.length === 0 ? <p className="py-3 text-xs text-ink/45">No vault opens logged yet.</p> : null}
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeTab === "Handovers" ? (
        <section className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <form className="rounded-lg border border-ink/10 bg-white p-4" onSubmit={(event) => void createHandover(event)}>
            <p className="flex items-center gap-2 text-sm font-semibold text-ink"><KeyRound className="h-4 w-4 text-moss" />Leadership handover system</p>
            <p className="mt-2 text-xs leading-5 text-ink/55">Track duties, documents, password asset references, tasks, branch records, and formal acceptance when a leader is transferred or replaced.</p>
            <div className="mt-4 space-y-3">
              <FieldSelect name="fromLeaderId" label="Outgoing leader">
                {userOptions}
              </FieldSelect>
              <FieldSelect name="toLeaderId" label="Incoming leader">
                <option value="">Not assigned yet</option>
                {userOptions}
              </FieldSelect>
              <Input name="title" placeholder="Handover title" required />
              <Textarea name="reason" placeholder="Reason for transfer/replacement" />
              {optionLists}
              <Textarea name="duties" placeholder="Duties, one per line" />
              <Textarea name="documents" placeholder="Documents and folders to hand over" />
              <Textarea name="passwordAssets" placeholder="Password vault references only, not raw passwords" />
              <Textarea name="pendingTasks" placeholder="Pending matters/tasks" />
              <Textarea name="branchRecords" placeholder="Branch records, projects, issues, contacts" />
              <Button type="submit" disabled={Boolean(loading)}>
                {loading === "HANDOVER" ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Create handover
              </Button>
            </div>
          </form>
          <div className="space-y-3">
            {data.handovers.map((handover) => (
              <div className="rounded-lg border border-ink/10 bg-white p-4" key={handover.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{handover.title}</p>
                    <p className="mt-1 text-xs text-ink/50">{userName.get(handover.fromLeaderId)} to {handover.toLeaderId ? userName.get(handover.toLeaderId) : "unassigned"} - {formatDate(handover.createdAt)}</p>
                  </div>
                  <Badge>{handover.status.toLowerCase().replaceAll("_", " ")}</Badge>
                </div>
                {handover.reason ? <p className="mt-3 text-sm text-ink/60">{handover.reason}</p> : null}
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <p className="rounded-md bg-paper p-3 text-xs text-ink/55"><span className="font-semibold text-ink">Duties:</span> {jsonLines(handover.duties)}</p>
                  <p className="rounded-md bg-paper p-3 text-xs text-ink/55"><span className="font-semibold text-ink">Documents:</span> {jsonLines(handover.documents)}</p>
                  <p className="rounded-md bg-paper p-3 text-xs text-ink/55"><span className="font-semibold text-ink">Password assets:</span> {jsonLines(handover.passwordAssets)}</p>
                  <p className="rounded-md bg-paper p-3 text-xs text-ink/55"><span className="font-semibold text-ink">Pending tasks:</span> {jsonLines(handover.pendingTasks)}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["PENDING_ACCEPTANCE", "ACCEPTED", "COMPLETED", "CANCELLED"].map((status) => (
                    <Button className="h-8 px-3 text-xs" key={status} variant={status === "CANCELLED" ? "danger" : "secondary"} onClick={() => void patchEntity("HANDOVER", handover.id, status, `Handover marked ${status.toLowerCase().replaceAll("_", " ")}.`)}>
                      {status.toLowerCase().replaceAll("_", " ")}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            {data.handovers.length === 0 ? <p className="rounded-lg border border-ink/10 bg-white p-8 text-sm text-ink/55">No leadership handovers created yet.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === "Letters" ? (
        <section className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <form className="rounded-lg border border-ink/10 bg-white p-4" onSubmit={(event) => void createLetter(event)}>
            <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Mail className="h-4 w-4 text-moss" />Official letter generator</p>
            <div className="mt-4 space-y-3">
              <FieldSelect name="letterType" label="Letter type" defaultValue="APPOINTMENT">
                <option value="APPOINTMENT">Appointment letter</option>
                <option value="TRANSFER">Transfer letter</option>
                <option value="ORDINATION">Ordination letter</option>
                <option value="RECOMMENDATION">Recommendation letter</option>
                <option value="INVITATION">Invitation letter</option>
                <option value="MEMBERSHIP_CONFIRMATION">Confirmation of membership</option>
              </FieldSelect>
              <Input name="title" placeholder="Letter title" required />
              <FieldSelect name="recipientUserId" label="Recipient profile">
                <option value="">No linked profile</option>
                {userOptions}
              </FieldSelect>
              <Input name="recipientName" placeholder="Recipient name" required />
              <Input name="recipientEmail" type="email" placeholder="Recipient email" />
              {optionLists}
              <Textarea name="body" placeholder="Letter body" required />
              <Input name="signatureName" placeholder="Signature name, default: Olawale N Sanni" />
              <label className="flex items-center gap-2 rounded-md border border-ink/10 bg-paper px-3 py-2 text-sm text-ink">
                <input name="issueNow" type="checkbox" defaultChecked />
                Issue immediately
              </label>
              <Button type="submit" disabled={Boolean(loading)}>
                {loading === "OFFICIAL_LETTER" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                Generate letter
              </Button>
            </div>
          </form>
          <div className="space-y-3">
            {data.letters.map((letter) => (
              <div className="rounded-lg border border-ink/10 bg-white p-4" key={letter.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{letter.title}</p>
                    <p className="mt-1 text-xs text-ink/50">{letter.letterNumber} - {letter.letterType.toLowerCase().replaceAll("_", " ")} - {letter.recipientName}</p>
                  </div>
                  <Badge>{letter.status.toLowerCase()}</Badge>
                </div>
                <p className="mt-3 line-clamp-3 text-sm leading-6 text-ink/60">{letter.body}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-ink/10 bg-paper px-3 text-xs font-medium text-ink hover:bg-mint/40" href={`/api/leadership-governance/letters/${letter.id}/pdf`}>
                    <Download className="h-3.5 w-3.5" />
                    PDF
                  </Link>
                  {["ISSUED", "REVOKED", "ARCHIVED"].map((status) => (
                    <Button className="h-8 px-3 text-xs" key={status} variant={status === "REVOKED" ? "danger" : "secondary"} onClick={() => void patchEntity("OFFICIAL_LETTER", letter.id, status, `Letter marked ${status.toLowerCase()}.`)}>
                      {status.toLowerCase()}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            {data.letters.length === 0 ? <p className="rounded-lg border border-ink/10 bg-white p-8 text-sm text-ink/55">No official letters generated yet.</p> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
