"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState, type MouseEvent, type ReactNode } from "react";
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
  ShieldCheck,
  Trash2
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
  sourceSnapshot: unknown;
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

const letterTemplates: Record<string, string> = {
  APPOINTMENT: [
    "This letter confirms your appointment to serve in the stated capacity within Light Encounter Tabernacle Worldwide.",
    "",
    "This appointment is made under the authority of LETW leadership and is effective from the date stated on this letter. Your responsibilities include faithful service, accountability to assigned leadership, protection of LETW values, timely reporting, and cooperation with all approved policies and instructions.",
    "",
    "You are expected to carry out this assignment with integrity, confidentiality, humility, excellence, and a clear commitment to the spiritual and operational growth of the ministry.",
    "",
    "Kindly acknowledge this appointment and complete any onboarding, documentation, handover, or reporting requirements assigned to you in the LETW system."
  ].join("\n"),
  TRANSFER: [
    "This letter confirms your official transfer within Light Encounter Tabernacle Worldwide.",
    "",
    "The transfer is issued for ministry coordination, leadership alignment, and effective administration. You are required to complete all handover duties, submit pending records, transfer relevant documents, and cooperate with both outgoing and receiving leadership.",
    "",
    "Your new assignment becomes effective from the date stated on this letter unless otherwise communicated by authorized LETW leadership.",
    "",
    "Please treat this transfer as an official LETW record and ensure all related responsibilities are completed in good order."
  ].join("\n"),
  RETIREMENT: [
    "This letter formally recognizes your retirement from the stated office, assignment, or active service responsibility within Light Encounter Tabernacle Worldwide.",
    "",
    "LETW acknowledges your years of service, sacrifice, leadership, labour, and contribution to the advancement of the work. This retirement is recorded with honour and becomes effective from the date stated on this letter unless otherwise directed by authorized LETW leadership.",
    "",
    "You are requested to complete any remaining handover, return entrusted property or documents, settle outstanding administrative matters, and provide any final report required by the leadership office.",
    "",
    "This letter does not remove your value, fellowship, honour, or spiritual standing in LETW. It records the conclusion of the stated service assignment and preserves the official record for future reference."
  ].join("\n"),
  RELIEVE_OF_SERVICE: [
    "This letter formally relieves you of the stated office, assignment, duty, or service responsibility within Light Encounter Tabernacle Worldwide.",
    "",
    "The decision is issued under LETW leadership authority and becomes effective from the date stated on this letter. From that date, you are no longer required to perform the duties attached to the stated assignment unless a new written instruction is issued by authorized leadership.",
    "",
    "You are required to complete all handover obligations, return LETW property, files, access materials, keys, devices, records, credentials, or confidential documents entrusted to you, and cooperate with any closing review requested by leadership.",
    "",
    "This letter should be treated as an official LETW administrative record and should only be relied upon while the QR verification page confirms an active issued status."
  ].join("\n"),
  PROMOTION: [
    "This letter confirms your promotion or elevation to the stated office, rank, ministry responsibility, or leadership capacity within Light Encounter Tabernacle Worldwide.",
    "",
    "This promotion follows leadership review and is issued in recognition of service, character, maturity, accountability, diligence, and the needs of the ministry. The new responsibility becomes effective from the date stated on this letter unless otherwise directed.",
    "",
    "You are expected to discharge this responsibility with humility, integrity, excellence, confidentiality, pastoral sensitivity, doctrinal soundness, and submission to LETW leadership order.",
    "",
    "Kindly complete all onboarding, handover, briefing, training, reporting, or workspace requirements assigned to you in the LETW system."
  ].join("\n"),
  DEPLOYMENT: [
    "This letter confirms your official deployment for the stated LETW assignment, location, branch, department, ministry, event, mission, outreach, or project.",
    "",
    "The deployment is made for ministry effectiveness, operational support, leadership coverage, or strategic assignment. You are expected to report to the designated leader or receiving authority and follow the approved scope, timeline, and instructions.",
    "",
    "Where documents, resources, travel, accommodation, budgets, team members, or equipment are attached to this deployment, they must be handled according to LETW policy and accounted for after the assignment.",
    "",
    "This deployment remains valid only while the QR verification page confirms an active issued status."
  ].join("\n"),
  COMMISSIONING: [
    "This letter confirms that you have been officially commissioned by Light Encounter Tabernacle Worldwide for the stated spiritual, ministerial, leadership, branch, project, outreach, or service assignment.",
    "",
    "This commissioning is issued under LETW authority and affirms your mandate to carry out the stated assignment within the approved scope. You are expected to uphold LETW doctrine, values, safeguarding standards, reporting requirements, and leadership accountability.",
    "",
    "The commissioning does not authorize activity outside the scope stated by LETW leadership and may be reviewed, suspended, replaced, or revoked where required.",
    "",
    "Please retain this record and verify its current status through the QR code where confirmation is required."
  ].join("\n"),
  SABBATICAL_LEAVE: [
    "This letter confirms the approval of sabbatical leave, ministry rest, study leave, recovery leave, or temporary withdrawal from active duty within Light Encounter Tabernacle Worldwide.",
    "",
    "The leave is granted for the period and purpose approved by LETW leadership. During this period, your active responsibilities may be transferred, delegated, or paused according to the handover arrangement approved by leadership.",
    "",
    "You are expected to remain reachable for agreed matters, protect confidential information, and resume or report back according to the stated instruction unless a further written approval is issued.",
    "",
    "This letter is an official LETW record and should be accepted only while the QR verification page confirms active status."
  ].join("\n"),
  DISCIPLINARY_NOTICE: [
    "This letter serves as an official LETW disciplinary notice concerning the matter stated in this record.",
    "",
    "The notice is issued under leadership authority after administrative or pastoral review. The recipient is required to observe the instruction, restriction, corrective action, response deadline, reporting requirement, or review process communicated by authorized leadership.",
    "",
    "This document must be handled confidentially. It must not be circulated, altered, or used outside the purpose for which it was issued. Any appeal, clarification, or response should be submitted through the approved LETW leadership channel.",
    "",
    "This notice remains valid only while the QR verification page confirms an active issued status."
  ].join("\n"),
  APPRECIATION: [
    "Light Encounter Tabernacle Worldwide hereby issues this official letter of appreciation in recognition of your faithful service, support, giving, leadership, sacrifice, or contribution to the work of the ministry.",
    "",
    "LETW acknowledges the value of your labour and the positive impact of your contribution. This appreciation is recorded for honour, encouragement, official reference, and preservation in the LETW administrative record.",
    "",
    "We pray that the Lord rewards your labour, strengthens your hands, and multiplies grace for greater impact.",
    "",
    "This letter may be verified through the QR code to confirm that it remains an active LETW record."
  ].join("\n"),
  AUTHORIZATION: [
    "This letter confirms that Light Encounter Tabernacle Worldwide authorizes the named recipient for the stated purpose, duty, transaction, representation, access, travel, collection, engagement, or official assignment.",
    "",
    "The authorization is limited to the scope, date, location, department, branch, ministry, or activity stated in this letter. It does not grant unlimited authority and may be withdrawn, replaced, or revoked by LETW leadership.",
    "",
    "Any person or institution relying on this authorization should verify the letter by scanning the QR code and confirming that the status is active.",
    "",
    "The recipient is expected to act with integrity, accountability, confidentiality, and full compliance with LETW instructions."
  ].join("\n"),
  INTRODUCTION: [
    "Light Encounter Tabernacle Worldwide hereby introduces the named recipient for the stated official, ministry, pastoral, administrative, travel, branch, event, or institutional purpose.",
    "",
    "This introduction is issued based on the records and leadership knowledge available at the time of issuance. It should be used only for the purpose stated in the letter and should not be altered, transferred, or relied upon after revocation or archival.",
    "",
    "Where further confirmation is required, the recipient or receiving organization should scan the QR code or open the verification page to confirm the current LETW registry status.",
    "",
    "We request that appropriate courtesy and assistance be extended within the limits of the stated purpose."
  ].join("\n"),
  ORDINATION: [
    "This letter confirms the official LETW record concerning your ordination and ministerial recognition.",
    "",
    "This recognition is granted after leadership review and is subject to continued spiritual integrity, sound doctrine, faithful service, accountability, and compliance with LETW governance, safeguarding, and pastoral standards.",
    "",
    "You are expected to discharge ministerial duties with holiness, wisdom, compassion, confidentiality, and respect for the authority and order of Light Encounter Tabernacle Worldwide.",
    "",
    "This record remains valid only while the verification page confirms an active status."
  ].join("\n"),
  RECOMMENDATION: [
    "Light Encounter Tabernacle Worldwide hereby issues this recommendation based on the official records and leadership knowledge available at the time of issuance.",
    "",
    "The named recipient is recognized in relation to the purpose stated in this letter. This recommendation should be used only for the stated purpose and should not be altered, transferred, or relied upon after revocation or archival.",
    "",
    "For confirmation, scan the QR code or open the verification page to confirm the current status of this letter."
  ].join("\n"),
  INVITATION: [
    "Light Encounter Tabernacle Worldwide is pleased to issue this official invitation.",
    "",
    "The recipient is invited to participate in the stated LETW activity, meeting, assignment, service, conference, or ministry engagement. Participation is subject to LETW order, security requirements, schedule, and any additional instructions communicated by authorized leadership.",
    "",
    "Please present this letter where required and confirm its current status through the verification QR code."
  ].join("\n"),
  MEMBERSHIP_CONFIRMATION: [
    "This letter confirms the membership record of the named recipient within Light Encounter Tabernacle Worldwide.",
    "",
    "Based on LETW records, the recipient is recognized in connection with the membership status, role, branch, ministry, or assignment stated in this letter. This confirmation is issued for administrative, pastoral, or official reference purposes only.",
    "",
    "This letter should be accepted only while the QR verification page confirms an active issued status."
  ].join("\n")
};

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

function officialLetterActionLabel(status: string) {
  if (status === "ISSUED") return "issue / re-sign";
  if (status === "REVOKED") return "revoke";
  if (status === "ARCHIVED") return "archive";
  return status.toLowerCase();
}

function itemsFromUnknown(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  if (typeof value === "string") return value ? [value] : [];
  return [];
}

function recordFromUnknown(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function metricLabel(value: string) {
  return value
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]+/g, " ")
    .trim()
    .toLowerCase();
}

function metricValue(key: string, value: unknown) {
  if (key.toLowerCase().includes("amountcents") && typeof value === "number") {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value / 100);
  }
  if (key.toLowerCase().includes("rate") && typeof value === "number") return `${value}%`;
  if (typeof value === "number") return new Intl.NumberFormat("en-GB").format(value);
  return String(value ?? "0");
}

function reportPrimaryMetrics(metrics: Record<string, unknown>) {
  const preferred = ["attendance", "soulsWon", "baptisms", "followUpsCompleted", "followUpCompletionRate", "givingReceipts", "activeProjects", "overdueProjects", "decisions"];
  return preferred
    .filter((key) => Object.prototype.hasOwnProperty.call(metrics, key))
    .map((key) => [key, metrics[key]] as const)
    .slice(0, 9);
}

function applyLetterTemplate(event: MouseEvent<HTMLButtonElement>) {
  const form = event.currentTarget.closest("form");
  const type = form?.querySelector<HTMLSelectElement>("select[name='letterType']")?.value ?? "APPOINTMENT";
  const body = form?.querySelector<HTMLTextAreaElement>("textarea[name='body']");
  if (!body) return;
  body.value = letterTemplates[type] ?? letterTemplates.APPOINTMENT;
  body.focus();
}

function handoverItemCount(handover: Handover) {
  return ["duties", "documents", "passwordAssets", "pendingTasks", "branchRecords"].reduce((total, key) => total + itemsFromUnknown(handover[key as keyof Handover]).length, 0);
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
    const form = event.currentTarget;
    setLoading(entity);
    setError("");
    setMessage("");
    try {
      await jsonRequest("/api/leadership-governance", {
        method: "POST",
        body: JSON.stringify({ entity, ...payload })
      });
      form.reset();
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

  async function deleteEntity(entity: string, id: string, success: string, extra: Record<string, unknown> = {}) {
    const isClearLog = extra.mode === "CLEAR_LOGS";
    const confirmed = window.confirm(
      isClearLog
        ? "This clears activity logs for the selected record. Continue?"
        : "This permanently deletes the selected record. Continue?"
    );
    if (!confirmed) return;
    setLoading(`${entity}-${id}-${String(extra.mode ?? "DELETE")}`);
    setError("");
    setMessage("");
    try {
      await jsonRequest("/api/leadership-governance", {
        method: "DELETE",
        body: JSON.stringify({ entity, id, ...extra })
      });
      await refresh();
      setMessage(success);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Delete failed.");
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
            <p className="flex items-center gap-2 text-sm font-semibold text-ink"><BarChart3 className="h-4 w-4 text-moss" />Executive monthly report pack</p>
            <p className="mt-2 text-xs leading-5 text-ink/55">
              Creates a modern leadership report with executive summary, KPI dashboard, operating highlights, risk register,
              recommendations, source assurance, and sign-off area.
            </p>
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
            {data.reports.map((report) => {
              const snapshot = recordFromUnknown(report.sourceSnapshot);
              const executive = recordFromUnknown(snapshot.executive);
              const risks = itemsFromUnknown(report.risks);
              const metrics = reportPrimaryMetrics(report.metrics ?? {});
              return (
                <div className="overflow-hidden rounded-lg border border-ink/10 bg-white shadow-soft" key={report.id}>
                  <div className="border-b border-ink/10 bg-[#0b1b3d] px-4 py-4 text-white">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-[#d4af37]">Executive ministry performance report</p>
                        <p className="mt-1 text-lg font-semibold">{report.title}</p>
                        <p className="mt-1 text-xs text-white/70">
                          {String(executive.periodLabel ?? `${report.year}-${String(report.month).padStart(2, "0")}`)} - {String(executive.scopeLabel ?? "LETW scope")}
                        </p>
                      </div>
                      <Badge className="border-white/20 bg-white/10 text-white">{report.status.toLowerCase()}</Badge>
                    </div>
                  </div>
                  <div className="p-4">
                    <p className="whitespace-pre-wrap text-sm leading-6 text-ink/68">{report.summary}</p>
                    <div className="mt-4 grid gap-2 sm:grid-cols-3">
                      {metrics.map(([key, value]) => (
                        <p className="rounded-md border border-ink/10 bg-paper px-3 py-2 text-xs text-ink/60" key={key}>
                          <span className="block text-base font-semibold text-ink">{metricValue(key, value)}</span>
                          {metricLabel(key)}
                        </p>
                      ))}
                    </div>
                    <div className="mt-3 grid gap-3 lg:grid-cols-2">
                      <div className="rounded-md border border-ink/10 bg-white p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-moss">Management conclusion</p>
                        <p className="mt-1 text-sm leading-5 text-ink/60">{String(executive.conclusion ?? "Review the PDF for full operating highlights, risk register, and source assurance.")}</p>
                      </div>
                      <div className="rounded-md border border-ink/10 bg-white p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-clay">Risk register</p>
                        <p className="mt-1 text-sm leading-5 text-ink/60">{risks.length ? risks.slice(0, 2).join(" ") : "No critical risk detected in available records."}</p>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-ink/10 bg-paper px-3 text-xs font-medium text-ink hover:bg-mint/40" href={`/api/leadership-governance/reports/${report.id}/pdf`}>
                        <Download className="h-3.5 w-3.5" />
                        Executive PDF
                      </Link>
                      {["FINAL", "ARCHIVED"].map((status) => (
                        <Button className="h-8 px-3 text-xs" key={status} variant="secondary" onClick={() => void patchEntity("MONTHLY_REPORT", report.id, status, `Report marked ${status.toLowerCase()}.`)}>
                          {status.toLowerCase()}
                        </Button>
                      ))}
                      <Button className="h-8 px-3 text-xs" variant="secondary" onClick={() => void deleteEntity("MONTHLY_REPORT", report.id, "Report activity logs cleared.", { mode: "CLEAR_LOGS" })}>
                        {loading === `MONTHLY_REPORT-${report.id}-CLEAR_LOGS` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
                        clear log
                      </Button>
                      <Button className="h-8 px-3 text-xs" variant="danger" onClick={() => void deleteEntity("MONTHLY_REPORT", report.id, "Monthly report deleted.", { mode: "DELETE" })}>
                        {loading === `MONTHLY_REPORT-${report.id}-DELETE` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        delete
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
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
            <p className="mt-2 text-xs leading-5 text-ink/55">
              Creates a formal transition dossier with outgoing/incoming leaders, scope, duties, documents, secure asset references,
              pending matters, branch records, acceptance stages, and printable sign-off PDF.
            </p>
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
              <Textarea name="duties" placeholder="Duties, one per line: worship oversight, pastoral care, reporting, budgets, approvals..." />
              <Textarea name="documents" placeholder="Documents/folders: minutes, reports, policy files, finance packs, contact lists..." />
              <Textarea name="passwordAssets" placeholder="Secure vault references only, not raw passwords" />
              <Textarea name="pendingTasks" placeholder="Pending matters: open approvals, unresolved issues, deadlines, risks..." />
              <Textarea name="branchRecords" placeholder="Branch/ministry records: projects, contacts, assets, emergencies, pastoral context..." />
              <Button type="submit" disabled={Boolean(loading)}>
                {loading === "HANDOVER" ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                Create handover
              </Button>
            </div>
          </form>
          <div className="space-y-3">
            {data.handovers.map((handover) => {
              const totalItems = handoverItemCount(handover);
              return (
                <div className="overflow-hidden rounded-lg border border-ink/10 bg-white shadow-soft" key={handover.id}>
                  <div className="border-b border-ink/10 bg-paper p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-wide text-moss">Formal transition dossier</p>
                        <p className="mt-1 text-lg font-semibold text-ink">{handover.title}</p>
                        <p className="mt-1 text-xs text-ink/50">
                          {userName.get(handover.fromLeaderId)} to {handover.toLeaderId ? userName.get(handover.toLeaderId) : "unassigned"} - created {formatDate(handover.createdAt)}
                        </p>
                      </div>
                      <Badge>{handover.status.toLowerCase().replaceAll("_", " ")}</Badge>
                    </div>
                  </div>
                  <div className="p-4">
                    {handover.reason ? <p className="rounded-md border border-ink/10 bg-white p-3 text-sm leading-6 text-ink/65">{handover.reason}</p> : null}
                    <div className="mt-3 grid gap-2 md:grid-cols-3">
                      <p className="rounded-md bg-paper p-3 text-xs text-ink/55"><span className="block text-base font-semibold text-ink">{totalItems}</span>handover items captured</p>
                      <p className="rounded-md bg-paper p-3 text-xs text-ink/55"><span className="block text-base font-semibold text-ink">{itemsFromUnknown(handover.pendingTasks).length}</span>pending matters</p>
                      <p className="rounded-md bg-paper p-3 text-xs text-ink/55"><span className="block text-base font-semibold text-ink">{itemsFromUnknown(handover.passwordAssets).length}</span>secure asset refs</p>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      <p className="rounded-md border border-ink/10 bg-white p-3 text-xs text-ink/55"><span className="font-semibold text-ink">Duties:</span> {jsonLines(handover.duties)}</p>
                      <p className="rounded-md border border-ink/10 bg-white p-3 text-xs text-ink/55"><span className="font-semibold text-ink">Documents:</span> {jsonLines(handover.documents)}</p>
                      <p className="rounded-md border border-ink/10 bg-white p-3 text-xs text-ink/55"><span className="font-semibold text-ink">Pending:</span> {jsonLines(handover.pendingTasks)}</p>
                      <p className="rounded-md border border-ink/10 bg-white p-3 text-xs text-ink/55"><span className="font-semibold text-ink">Branch records:</span> {jsonLines(handover.branchRecords)}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-ink/10 bg-paper px-3 text-xs font-medium text-ink hover:bg-mint/40" href={`/api/leadership-governance/handovers/${handover.id}/pdf`}>
                        <Download className="h-3.5 w-3.5" />
                        Handover PDF
                      </Link>
                      {["PENDING_ACCEPTANCE", "ACCEPTED", "COMPLETED", "CANCELLED"].map((status) => (
                        <Button className="h-8 px-3 text-xs" key={status} variant={status === "CANCELLED" ? "danger" : "secondary"} onClick={() => void patchEntity("HANDOVER", handover.id, status, `Handover marked ${status.toLowerCase().replaceAll("_", " ")}.`)}>
                          {status.toLowerCase().replaceAll("_", " ")}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
            {data.handovers.length === 0 ? <p className="rounded-lg border border-ink/10 bg-white p-8 text-sm text-ink/55">No leadership handovers created yet.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === "Letters" ? (
        <section className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <form className="rounded-lg border border-ink/10 bg-white p-4" onSubmit={(event) => void createLetter(event)}>
            <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Mail className="h-4 w-4 text-moss" />Official letter generator</p>
            <p className="mt-2 rounded-md bg-paper p-3 text-xs leading-5 text-ink/60">
              Use this for appointment, transfer, retirement, relieve of service, promotion, deployment, commissioning, sabbatical leave, disciplinary notice,
              appreciation, authorization, introduction, ordination, recommendation, invitation, and membership confirmation letters. The PDF adds LETW letterhead,
              protected QR verification, official record details, scope, seal, signature block, and multi-page formatting automatically.
            </p>
            <div className="mt-4 space-y-3">
              <FieldSelect name="letterType" label="Letter type" defaultValue="APPOINTMENT">
                <option value="APPOINTMENT">Appointment letter</option>
                <option value="TRANSFER">Transfer letter</option>
                <option value="RETIREMENT">Retirement letter</option>
                <option value="RELIEVE_OF_SERVICE">Relieve of service letter</option>
                <option value="PROMOTION">Promotion letter</option>
                <option value="DEPLOYMENT">Deployment letter</option>
                <option value="COMMISSIONING">Commissioning letter</option>
                <option value="SABBATICAL_LEAVE">Sabbatical / leave approval</option>
                <option value="DISCIPLINARY_NOTICE">Disciplinary notice</option>
                <option value="APPRECIATION">Appreciation letter</option>
                <option value="AUTHORIZATION">Authorization letter</option>
                <option value="INTRODUCTION">Introduction / reference letter</option>
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
              <Button type="button" variant="secondary" onClick={applyLetterTemplate}>
                <FileText className="h-4 w-4" />
                Insert professional body template
              </Button>
              <Textarea
                className="min-h-40"
                name="body"
                placeholder="Recommended structure: purpose of the letter, authority/approval, effective date, role or assignment details, responsibilities, reporting line, expected conduct, support provided by LETW, and any next steps."
                required
              />
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
                  <Link className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-ink/10 bg-paper px-3 text-xs font-medium text-ink hover:bg-mint/40" href={`/verify/letter/${letter.id}`}>
                    <Eye className="h-3.5 w-3.5" />
                    Verify
                  </Link>
                  {["ISSUED", "REVOKED", "ARCHIVED"].map((status) => (
                    <Button className="h-8 px-3 text-xs" key={status} variant={status === "REVOKED" ? "danger" : "secondary"} onClick={() => void patchEntity("OFFICIAL_LETTER", letter.id, status, `Letter marked ${status.toLowerCase()}.`)}>
                      {officialLetterActionLabel(status)}
                    </Button>
                  ))}
                  <Button className="h-8 px-3 text-xs" variant="danger" onClick={() => void deleteEntity("OFFICIAL_LETTER", letter.id, "Official letter deleted.")}>
                    {loading === `OFFICIAL_LETTER-${letter.id}-DELETE` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    delete
                  </Button>
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
