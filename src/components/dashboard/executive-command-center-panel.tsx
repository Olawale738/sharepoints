"use client";

import { FormEvent, useMemo, useState, type ReactNode } from "react";
import {
  Archive,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  FileSignature,
  FileVideo,
  Gavel,
  Loader2,
  MessageCircle,
  RadioTower,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCheck,
  XCircle,
  type LucideIcon
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";

type WorkspaceOption = { id: string; name: string };
type UnitOption = { id: string; name: string; type: string; countryCode: string | null; code: string | null };
type UserOption = { id: string; name: string | null; email: string | null };

type Command = {
  id: string;
  command: string;
  parsedIntent: string;
  targetScope: string | null;
  draftAction: unknown;
  status: string;
  requestedById: string;
  approvedById: string | null;
  resultSummary: string | null;
  createdAt: string;
};

type Signature = {
  id: string;
  targetType: string;
  targetId: string;
  title: string;
  signerId: string | null;
  signerName: string;
  signerEmail: string | null;
  status: string;
  signatureName: string | null;
  signedAt: string | null;
  revokedAt: string | null;
  verificationHash: string;
  createdAt: string;
};

type Evidence = {
  id: string;
  workspaceId: string | null;
  organizationUnitId: string | null;
  evidenceType: string;
  title: string;
  subjectName: string | null;
  summary: string;
  sourceUrl: string | null;
  restrictedTo: string;
  legalHold: boolean;
  status: string;
  createdById: string;
  createdAt: string;
  updatedAt: string;
};

type PresidentialAction = {
  id: string;
  workspaceId: string | null;
  organizationUnitId: string | null;
  title: string;
  description: string;
  category: string;
  priority: string;
  status: string;
  sourceType: string | null;
  sourceId: string | null;
  assignedToId: string | null;
  dueAt: string | null;
  decisionNote: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
};

type MediaArchiveItem = {
  id: string;
  workspaceId: string | null;
  organizationUnitId: string | null;
  title: string;
  speaker: string;
  scripture: string | null;
  language: string;
  mediaType: string;
  mediaUrl: string | null;
  mediaFileName: string | null;
  mediaFileType: string | null;
  mediaSize: number | null;
  notes: string | null;
  visibility: string;
  approvalStatus: string;
  isFeatured: boolean;
  retentionLabel: string | null;
  transcriptSummary: string | null;
  createdById: string;
  createdAt: string;
};

type BriefingItem = {
  id: string;
  title: string;
  status?: string;
  dueAt?: string | null;
  startsAt?: string | null;
  createdAt?: string;
  month?: number;
  year?: number;
};

type ExecutiveData = {
  access: {
    isAdmin: boolean;
    canUseWhatsAppCommandBot: boolean;
    canManageDigitalSignatures: boolean;
    canManageEvidenceVault: boolean;
    canViewExecutiveBriefing: boolean;
    canManagePresidentialActions: boolean;
    canManageMediaArchive: boolean;
    canUseExecutiveSecretary: boolean;
  };
  workspaces: WorkspaceOption[];
  units: UnitOption[];
  users: UserOption[];
  briefing: {
    pendingApprovals: number;
    urgentDecisions: BriefingItem[];
    delayedHandovers: BriefingItem[];
    pendingReports: BriefingItem[];
    openVaultRecords: number;
    upcomingMeetings: BriefingItem[];
    weakBranches: UnitOption[];
    generatedAt: string;
  };
  commands: Command[];
  signatures: Signature[];
  evidence: Evidence[];
  presidentialActions: PresidentialAction[];
  mediaArchive: MediaArchiveItem[];
};

const tabs = ["Briefing", "Action desk", "Media archive", "Secretary", "WhatsApp bot", "Signatures", "Evidence vault"] as const;

function emptyToNull(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

function recordFrom(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function titleCase(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
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

function MetricTile({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: number; detail: string }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
      <div className="flex items-center justify-between gap-3">
        <Icon className="h-5 w-5 text-moss" />
        <span className="text-2xl font-semibold text-ink">{value}</span>
      </div>
      <p className="mt-2 text-sm font-medium text-ink">{label}</p>
      <p className="mt-1 text-xs leading-5 text-ink/50">{detail}</p>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function SelectField({
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

function DraftAction({ value }: { value: unknown }) {
  const action = recordFrom(value);
  const checklist = Array.isArray(action.checklist) ? action.checklist.map(String) : [];
  const nextSteps = Array.isArray(action.nextSteps) ? action.nextSteps.map(String) : [];
  return (
    <div className="rounded-md border border-ink/10 bg-paper p-3 text-sm leading-6 text-ink/65">
      <p className="font-medium text-ink">{String(action.title ?? "Draft action")}</p>
      <p>{String(action.summary ?? "Review this draft before any action is taken.")}</p>
      {action.draftMessage ? <p className="mt-2 rounded-md bg-white p-2 text-xs text-ink/60">{String(action.draftMessage)}</p> : null}
      {[...nextSteps, ...checklist].slice(0, 5).map((item) => (
        <p className="mt-1 text-xs text-ink/55" key={item}>- {item}</p>
      ))}
    </div>
  );
}

export function ExecutiveCommandCenterPanel({ initialData }: { initialData: ExecutiveData }) {
  const [data, setData] = useState(initialData);
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Briefing");
  const [loading, setLoading] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [secretaryAnswer, setSecretaryAnswer] = useState("");
  const [secretaryModel, setSecretaryModel] = useState("");

  const userName = useMemo(() => {
    const names = new Map<string, string>();
    data.users.forEach((user) => names.set(user.id, user.name ?? user.email ?? "Unknown user"));
    return names;
  }, [data.users]);

  async function refresh() {
    const next = await jsonRequest<ExecutiveData>("/api/executive-command-center");
    setData(next);
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>, entity: string, payload: Record<string, unknown>, success: string) {
    event.preventDefault();
    setLoading(entity);
    setMessage("");
    setError("");
    try {
      await jsonRequest("/api/executive-command-center", {
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

  async function submitPatch(entity: string, id: string, payload: Record<string, unknown>, success: string) {
    setLoading(`${entity}-${id}-${Object.values(payload).join("-")}`);
    setMessage("");
    setError("");
    try {
      await jsonRequest("/api/executive-command-center", {
        method: "PATCH",
        body: JSON.stringify({ entity, id, ...payload })
      });
      await refresh();
      setMessage(success);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Update failed.");
    } finally {
      setLoading("");
    }
  }

  async function submitDelete(entity: string, id: string, success: string) {
    if (!window.confirm("Permanently delete this executive record?")) return;
    setLoading(`${entity}-${id}-DELETE`);
    setMessage("");
    setError("");
    try {
      await jsonRequest("/api/executive-command-center", {
        method: "DELETE",
        body: JSON.stringify({ entity, id })
      });
      await refresh();
      setMessage(success);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Delete failed.");
    } finally {
      setLoading("");
    }
  }

  async function createCommand(event: FormEvent<HTMLFormElement>) {
    const form = new FormData(event.currentTarget);
    await submitCreate(event, "WHATSAPP_COMMAND", {
      command: String(form.get("command"))
    }, "WhatsApp command draft created for approval.");
  }

  async function createSignature(event: FormEvent<HTMLFormElement>) {
    const form = new FormData(event.currentTarget);
    const signerId = emptyToNull(form.get("signerId"));
    const signer = signerId ? data.users.find((user) => user.id === signerId) : null;
    await submitCreate(event, "DIGITAL_SIGNATURE", {
      targetType: String(form.get("targetType")),
      targetId: String(form.get("targetId")),
      title: String(form.get("title")),
      signerId,
      signerName: String(form.get("signerName") || signer?.name || signer?.email || ""),
      signerEmail: emptyToNull(form.get("signerEmail")) || signer?.email || null
    }, "Digital signature request created with verification history.");
  }

  async function createEvidence(event: FormEvent<HTMLFormElement>) {
    const form = new FormData(event.currentTarget);
    await submitCreate(event, "EVIDENCE", {
      evidenceType: String(form.get("evidenceType")),
      title: String(form.get("title")),
      subjectName: emptyToNull(form.get("subjectName")),
      summary: String(form.get("summary")),
      sourceUrl: emptyToNull(form.get("sourceUrl")),
      workspaceId: emptyToNull(form.get("workspaceId")),
      organizationUnitId: emptyToNull(form.get("organizationUnitId"))
    }, "Evidence saved under restricted legal-hold control.");
  }

  async function createPresidentialAction(event: FormEvent<HTMLFormElement>) {
    const form = new FormData(event.currentTarget);
    await submitCreate(event, "PRESIDENTIAL_ACTION", {
      title: String(form.get("title")),
      description: String(form.get("description")),
      category: emptyToNull(form.get("category")),
      priority: String(form.get("priority")),
      assignedToId: emptyToNull(form.get("assignedToId")),
      dueAt: form.get("dueAt") ? new Date(String(form.get("dueAt"))).toISOString() : null,
      workspaceId: emptyToNull(form.get("workspaceId")),
      organizationUnitId: emptyToNull(form.get("organizationUnitId")),
      sourceType: emptyToNull(form.get("sourceType")),
      sourceId: emptyToNull(form.get("sourceId"))
    }, "Presidential action created and audited.");
  }

  async function uploadMediaArchive(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setLoading("MEDIA_ARCHIVE_UPLOAD");
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/media-archive/upload", {
        method: "POST",
        body: formData
      });
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error ?? "Media archive upload failed.");
      form.reset();
      await refresh();
      setMessage("Secure media archive item saved for approval.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Media archive upload failed.");
    } finally {
      setLoading("");
    }
  }

  async function askSecretary(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading("EXECUTIVE_SECRETARY");
    setMessage("");
    setError("");
    try {
      const response = await jsonRequest<{ answer: string; model: string }>("/api/executive-command-center", {
        method: "POST",
        body: JSON.stringify({ entity: "EXECUTIVE_SECRETARY", prompt: String(form.get("prompt")) })
      });
      setSecretaryAnswer(response.answer);
      setSecretaryModel(response.model);
      setMessage("Executive Secretary response generated.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Executive Secretary failed.");
    } finally {
      setLoading("");
    }
  }

  const userOptions = data.users.map((user) => (
    <option key={user.id} value={user.id}>
      {user.name ?? user.email}
    </option>
  ));

  const scopeFields = (
    <>
      <SelectField name="workspaceId" label="Workspace scope">
        <option value="">No workspace</option>
        {data.workspaces.map((workspace) => (
          <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
        ))}
      </SelectField>
      <SelectField name="organizationUnitId" label="Country / branch / ministry">
        <option value="">No unit</option>
        {data.units.map((unit) => (
          <option key={unit.id} value={unit.id}>{unit.name} - {unit.type.toLowerCase()}</option>
        ))}
      </SelectField>
    </>
  );

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <RadioTower className="h-4 w-4" />
              Executive briefing room
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">President, top pastors, command, signing, and evidence center</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-ink/60">
              Review urgent leadership matters, turn WhatsApp instructions into approved action drafts, sign official records,
              and preserve confidential evidence with strict audit history.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Badge>{data.access.isAdmin ? "admin authority" : "delegated authority"}</Badge>
            <Badge>{formatDate(data.briefing.generatedAt)}</Badge>
          </div>
        </div>
        {message ? <p className="mt-4 rounded-md bg-mint px-3 py-2 text-sm text-ink">{message}</p> : null}
        {error ? <p className="mt-4 rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
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

      {activeTab === "Briefing" ? (
        <section className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricTile icon={ClipboardCheck} label="Pending approvals" value={data.briefing.pendingApprovals} detail="Documents, tasks, announcements, and meetings waiting for review." />
            <MetricTile icon={ShieldAlert} label="Open restricted vault" value={data.briefing.openVaultRecords} detail="Prayer, counselling, and safeguarding records still active." />
            <MetricTile icon={FileSignature} label="Pending signatures" value={data.signatures.filter((item) => item.status === "REQUESTED").length} detail="Letters, reports, policies, certificates, or handovers awaiting signature." />
            <MetricTile icon={MessageCircle} label="Command drafts" value={data.commands.filter((item) => item.status === "PENDING_APPROVAL").length} detail="WhatsApp commands waiting for approval." />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <SectionCard title="Decisions needing action">
              <div className="divide-y divide-ink/10">
                {data.briefing.urgentDecisions.map((item) => (
                  <div className="py-3" key={item.id}>
                    <p className="font-medium text-ink">{item.title}</p>
                    <p className="text-xs text-ink/50">{titleCase(item.status ?? "pending")} {item.dueAt ? `- due ${formatDate(item.dueAt)}` : ""}</p>
                  </div>
                ))}
                {data.briefing.urgentDecisions.length === 0 ? <p className="py-3 text-sm text-ink/50">No urgent leadership decisions.</p> : null}
              </div>
            </SectionCard>
            <SectionCard title="Reports and handovers requiring review">
              <div className="divide-y divide-ink/10">
                {[...data.briefing.pendingReports, ...data.briefing.delayedHandovers].slice(0, 10).map((item) => (
                  <div className="py-3" key={item.id}>
                    <p className="font-medium text-ink">{item.title}</p>
                    <p className="text-xs text-ink/50">{titleCase(item.status ?? "review")} {item.month ? `- ${item.year}-${String(item.month).padStart(2, "0")}` : ""}</p>
                  </div>
                ))}
                {data.briefing.pendingReports.length + data.briefing.delayedHandovers.length === 0 ? <p className="py-3 text-sm text-ink/50">No pending reports or handovers.</p> : null}
              </div>
            </SectionCard>
            <SectionCard title="Upcoming leadership meetings">
              <div className="divide-y divide-ink/10">
                {data.briefing.upcomingMeetings.map((item) => (
                  <div className="py-3" key={item.id}>
                    <p className="font-medium text-ink">{item.title}</p>
                    <p className="text-xs text-ink/50">{item.startsAt ? formatDate(item.startsAt) : "Date not set"}</p>
                  </div>
                ))}
                {data.briefing.upcomingMeetings.length === 0 ? <p className="py-3 text-sm text-ink/50">No upcoming meetings in the next 14 days.</p> : null}
              </div>
            </SectionCard>
            <SectionCard title="Branches or ministries missing this month report">
              <div className="divide-y divide-ink/10">
                {data.briefing.weakBranches.map((unit) => (
                  <div className="py-3" key={unit.id}>
                    <p className="font-medium text-ink">{unit.name}</p>
                    <p className="text-xs text-ink/50">{unit.type.toLowerCase()} {unit.countryCode ? `- ${unit.countryCode}` : ""}</p>
                  </div>
                ))}
                {data.briefing.weakBranches.length === 0 ? <p className="py-3 text-sm text-ink/50">No missing branch/ministry reports found.</p> : null}
              </div>
            </SectionCard>
          </div>
        </section>
      ) : null}

      {activeTab === "Action desk" ? (
        <section className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <form className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft" onSubmit={(event) => void createPresidentialAction(event)}>
            <p className="flex items-center gap-2 text-sm font-semibold text-ink"><ClipboardCheck className="h-4 w-4 text-moss" />Presidential action desk</p>
            <p className="mt-2 text-xs leading-5 text-ink/55">Create executive instructions, assign owners, set deadlines, and track decisions until completion.</p>
            <div className="mt-4 space-y-3">
              <Input name="title" placeholder="Action title" required />
              <Input name="category" placeholder="Category, e.g. Branch, Media, Finance, Pastoral" />
              <SelectField name="priority" label="Priority" defaultValue="HIGH">
                {["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"].map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
              </SelectField>
              <SelectField name="assignedToId" label="Assign to">
                <option value="">Not assigned</option>
                {userOptions}
              </SelectField>
              <Input name="dueAt" type="datetime-local" />
              {scopeFields}
              <Input name="sourceType" placeholder="Optional source type, e.g. REPORT" />
              <Input name="sourceId" placeholder="Optional source ID/reference" />
              <Textarea name="description" placeholder="Instruction, decision, risk, context, expected evidence, and completion standard" required />
              <Button type="submit" disabled={loading === "PRESIDENTIAL_ACTION"}>
                {loading === "PRESIDENTIAL_ACTION" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                Create action
              </Button>
            </div>
          </form>
          <div className="space-y-3">
            {data.presidentialActions.map((action) => (
              <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft" key={action.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{action.title}</p>
                    <p className="mt-1 text-xs text-ink/50">
                      {titleCase(action.category)} - {titleCase(action.priority)} - assigned to {userName.get(action.assignedToId ?? "") ?? "not assigned"}
                    </p>
                  </div>
                  <Badge>{titleCase(action.status)}</Badge>
                </div>
                <p className="mt-3 whitespace-pre-wrap rounded-md border border-ink/10 bg-white p-3 text-sm leading-6 text-ink/65">{action.description}</p>
                {action.decisionNote ? <p className="mt-2 rounded-md bg-paper p-3 text-xs text-ink/60">{action.decisionNote}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {["IN_REVIEW", "APPROVED", "REJECTED", "ASSIGNED", "COMPLETED", "ARCHIVED"].map((status) => (
                    <Button
                      className="h-8 px-3 text-xs"
                      key={status}
                      variant={status === "REJECTED" ? "danger" : "secondary"}
                      onClick={() => void submitPatch("PRESIDENTIAL_ACTION", action.id, { status }, `Action marked ${titleCase(status)}.`)}
                    >
                      {titleCase(status)}
                    </Button>
                  ))}
                  <Button className="h-8 px-3 text-xs" variant="danger" onClick={() => void submitDelete("PRESIDENTIAL_ACTION", action.id, "Presidential action deleted.")}>
                    <Trash2 className="h-3.5 w-3.5" />
                    delete
                  </Button>
                </div>
              </div>
            ))}
            {data.presidentialActions.length === 0 ? <p className="rounded-lg border border-ink/10 bg-white p-8 text-sm text-ink/55">No presidential action items yet.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === "Media archive" ? (
        <section className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <form className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft" onSubmit={(event) => void uploadMediaArchive(event)}>
            <p className="flex items-center gap-2 text-sm font-semibold text-ink"><FileVideo className="h-4 w-4 text-moss" />Secure media archive</p>
            <p className="mt-2 text-xs leading-5 text-ink/55">Upload sermons, service videos, audio, images, notes, and resources. Public publishing requires approval.</p>
            <div className="mt-4 space-y-3">
              <Input name="title" placeholder="Sermon/resource title" required />
              <Input name="speaker" placeholder="Speaker/minister" required />
              <Input name="scripture" placeholder="Scripture reference" />
              <Input name="language" defaultValue="en" placeholder="Language code" />
              <SelectField name="mediaType" label="Media type" defaultValue="VIDEO">
                {["VIDEO", "AUDIO", "DOCUMENT", "IMAGE", "LINK"].map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
              </SelectField>
              <input className="block w-full rounded-md border border-ink/10 bg-white px-3 py-2 text-sm" name="file" type="file" accept="video/*,audio/*,image/*,.pdf,.doc,.docx,.ppt,.pptx" />
              <Input name="mediaUrl" type="url" placeholder="Or paste YouTube/Vimeo/audio/document URL" />
              <SelectField name="visibility" label="Visibility" defaultValue="MEMBERS">
                {["PRIVATE", "LEADERSHIP", "MEMBERS", "PUBLIC"].map((item) => <option key={item} value={item}>{titleCase(item)}</option>)}
              </SelectField>
              {scopeFields}
              <Input name="tags" placeholder="Tags: sermon, worship, youth, doctrine" />
              <Input name="retentionLabel" placeholder="Retention label" defaultValue="LETW media archive" />
              <Textarea name="notes" placeholder="Summary, altar call, testimony notes, study guide, or publishing notes" />
              <Button type="submit" disabled={loading === "MEDIA_ARCHIVE_UPLOAD"}>
                {loading === "MEDIA_ARCHIVE_UPLOAD" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileVideo className="h-4 w-4" />}
                Save media
              </Button>
            </div>
          </form>
          <div className="space-y-3">
            {data.mediaArchive.map((item) => (
              <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft" key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{item.title}</p>
                    <p className="mt-1 text-xs text-ink/50">{item.speaker} - {item.scripture ?? "No scripture"} - {item.language.toUpperCase()}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge>{titleCase(item.approvalStatus)}</Badge>
                    <Badge>{titleCase(item.visibility)}</Badge>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-ink/60">{item.notes ?? item.transcriptSummary ?? "No notes yet."}</p>
                {item.mediaUrl ? <a className="mt-2 inline-flex text-xs font-medium text-moss underline" href={item.mediaUrl} target="_blank" rel="noreferrer">Open media</a> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {["APPROVED", "REJECTED", "PENDING"].map((approvalStatus) => (
                    <Button className="h-8 px-3 text-xs" key={approvalStatus} variant={approvalStatus === "REJECTED" ? "danger" : "secondary"} onClick={() => void submitPatch("MEDIA_ARCHIVE", item.id, { approvalStatus }, `Media marked ${titleCase(approvalStatus)}.`)}>
                      {titleCase(approvalStatus)}
                    </Button>
                  ))}
                  {["PRIVATE", "LEADERSHIP", "MEMBERS", "PUBLIC"].map((visibility) => (
                    <Button className="h-8 px-3 text-xs" key={visibility} variant="secondary" onClick={() => void submitPatch("MEDIA_ARCHIVE", item.id, { visibility }, `Media visibility set to ${titleCase(visibility)}.`)}>
                      {titleCase(visibility)}
                    </Button>
                  ))}
                  <Button className="h-8 px-3 text-xs" variant="secondary" onClick={() => void submitPatch("MEDIA_ARCHIVE", item.id, { isFeatured: !item.isFeatured }, item.isFeatured ? "Media unfeatured." : "Media featured.")}>
                    {item.isFeatured ? "unfeature" : "feature"}
                  </Button>
                  <Button className="h-8 px-3 text-xs" variant="danger" onClick={() => void submitDelete("MEDIA_ARCHIVE", item.id, "Media archive item deleted.")}>
                    <Trash2 className="h-3.5 w-3.5" />
                    delete
                  </Button>
                </div>
              </div>
            ))}
            {data.mediaArchive.length === 0 ? <p className="rounded-lg border border-ink/10 bg-white p-8 text-sm text-ink/55">No media archive items yet.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === "Secretary" ? (
        <section className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <form className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft" onSubmit={(event) => void askSecretary(event)}>
            <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Bot className="h-4 w-4 text-moss" />AI Executive Secretary</p>
            <p className="mt-2 text-xs leading-5 text-ink/55">Ask for executive briefings, action drafts, media approval summaries, pending reports, and decision follow-up suggestions.</p>
            <div className="mt-4 space-y-3">
              <Textarea name="prompt" className="min-h-32" placeholder="Prepare my Sunday leadership briefing. Show urgent actions, pending reports, unsigned documents, and media awaiting approval." required />
              <div className="flex flex-wrap gap-2">
                {[
                  "Prepare my Sunday leadership briefing.",
                  "Show actions that need presidential approval.",
                  "Draft instructions to all leaders with overdue reports.",
                  "Summarize media items waiting for public approval."
                ].map((example) => (
                  <button className="rounded-md border border-ink/10 bg-paper px-3 py-2 text-left text-xs text-ink/65 hover:bg-mint/40" key={example} type="button" onClick={(event) => {
                    const form = event.currentTarget.closest("form");
                    const textarea = form?.querySelector<HTMLTextAreaElement>("textarea[name='prompt']");
                    if (textarea) textarea.value = example;
                  }}>
                    {example}
                  </button>
                ))}
              </div>
              <Button type="submit" disabled={loading === "EXECUTIVE_SECRETARY"}>
                {loading === "EXECUTIVE_SECRETARY" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                Ask secretary
              </Button>
            </div>
          </form>
          <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
            <p className="text-sm font-semibold text-ink">Secretary response</p>
            {secretaryModel ? <p className="mt-1 text-xs text-ink/45">Generated by {secretaryModel}</p> : null}
            {secretaryAnswer ? (
              <div className="mt-4 whitespace-pre-wrap rounded-md bg-paper p-4 text-sm leading-7 text-ink/75">{secretaryAnswer}</div>
            ) : (
              <p className="mt-4 rounded-md bg-paper p-4 text-sm text-ink/55">Ask the Executive Secretary to prepare a briefing or draft. It is read-only and requires human confirmation before any action is taken.</p>
            )}
          </div>
        </section>
      ) : null}

      {activeTab === "WhatsApp bot" ? (
        <section className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <form className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft" onSubmit={(event) => void createCommand(event)}>
            <p className="flex items-center gap-2 text-sm font-semibold text-ink"><MessageCircle className="h-4 w-4 text-moss" />WhatsApp admin command bot</p>
            <p className="mt-2 text-xs leading-5 text-ink/55">Admins and approved leaders can send WhatsApp commands. LETW captures the command as a draft; nothing is executed until approved.</p>
            <Textarea className="mt-4 min-h-28" name="command" placeholder='Examples: "show pending reports", "remind Lagos leaders", "create Sunday service plan"' required />
            <Button className="mt-3" type="submit" disabled={loading === "WHATSAPP_COMMAND"}>
              {loading === "WHATSAPP_COMMAND" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageCircle className="h-4 w-4" />}
              Create command draft
            </Button>
          </form>
          <div className="space-y-3">
            {data.commands.map((command) => (
              <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft" key={command.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{titleCase(command.parsedIntent)}</p>
                    <p className="mt-1 text-xs text-ink/50">Requested by {userName.get(command.requestedById) ?? "unknown"} - {formatDate(command.createdAt)}</p>
                  </div>
                  <Badge>{titleCase(command.status)}</Badge>
                </div>
                <p className="mt-3 rounded-md border border-ink/10 bg-white p-3 text-sm text-ink/65">{command.command}</p>
                <div className="mt-3"><DraftAction value={command.draftAction} /></div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["APPROVED", "SENT", "CANCELLED"].map((status) => (
                    <Button
                      className="h-8 px-3 text-xs"
                      key={status}
                      variant={status === "CANCELLED" ? "danger" : "secondary"}
                      onClick={() => void submitPatch("WHATSAPP_COMMAND", command.id, { status }, `Command marked ${titleCase(status)}.`)}
                    >
                      {status === "APPROVED" ? <CheckCircle2 className="h-3.5 w-3.5" /> : status === "CANCELLED" ? <XCircle className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                      {titleCase(status)}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            {data.commands.length === 0 ? <p className="rounded-lg border border-ink/10 bg-white p-8 text-sm text-ink/55">No WhatsApp admin command drafts yet.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === "Signatures" ? (
        <section className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <form className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft" onSubmit={(event) => void createSignature(event)}>
            <p className="flex items-center gap-2 text-sm font-semibold text-ink"><FileSignature className="h-4 w-4 text-moss" />Document signing</p>
            <p className="mt-2 text-xs leading-5 text-ink/55">Use this for letters, reports, handovers, policies, and certificates. Each signature gets a verification hash and audit history.</p>
            <div className="mt-4 space-y-3">
              <SelectField name="targetType" label="Record type" defaultValue="LETTER">
                <option value="LETTER">Letter</option>
                <option value="REPORT">Report</option>
                <option value="HANDOVER">Handover</option>
                <option value="POLICY">Policy</option>
                <option value="CERTIFICATE">Certificate</option>
              </SelectField>
              <Input name="targetId" placeholder="Record ID or reference number" required />
              <Input name="title" placeholder="Signature title" required />
              <SelectField name="signerId" label="Signer profile">
                <option value="">Manual signer</option>
                {userOptions}
              </SelectField>
              <Input name="signerName" placeholder="Signer name" />
              <Input name="signerEmail" type="email" placeholder="Signer email" />
              <Button type="submit" disabled={loading === "DIGITAL_SIGNATURE"}>
                {loading === "DIGITAL_SIGNATURE" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
                Request signature
              </Button>
            </div>
          </form>
          <div className="space-y-3">
            {data.signatures.map((signature) => (
              <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft" key={signature.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{signature.title}</p>
                    <p className="mt-1 text-xs text-ink/50">{signature.targetType} - {signature.targetId} - {signature.signerName}</p>
                  </div>
                  <Badge>{titleCase(signature.status)}</Badge>
                </div>
                <p className="mt-3 rounded-md bg-paper p-3 font-mono text-xs text-ink/60">Hash: {signature.verificationHash.slice(0, 32)}...</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button className="h-8 px-3 text-xs" variant="secondary" onClick={() => void submitPatch("DIGITAL_SIGNATURE", signature.id, { action: "SIGN", signatureName: signature.signerName }, "Document signed and verification hash refreshed.")}>
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    sign
                  </Button>
                  <Button className="h-8 px-3 text-xs" variant="danger" onClick={() => void submitPatch("DIGITAL_SIGNATURE", signature.id, { action: "REVOKE" }, "Digital signature revoked.")}>
                    <XCircle className="h-3.5 w-3.5" />
                    revoke
                  </Button>
                </div>
              </div>
            ))}
            {data.signatures.length === 0 ? <p className="rounded-lg border border-ink/10 bg-white p-8 text-sm text-ink/55">No digital signature requests yet.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === "Evidence vault" ? (
        <section className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <form className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft" onSubmit={(event) => void createEvidence(event)}>
            <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Gavel className="h-4 w-4 text-moss" />Confidential evidence vault</p>
            <p className="mt-2 text-xs leading-5 text-ink/55">For sensitive documents, screenshots, incident files, signatures, and witness records. New records default to legal hold.</p>
            <div className="mt-4 space-y-3">
              <SelectField name="evidenceType" label="Evidence type" defaultValue="DOCUMENT">
                <option value="DOCUMENT">Document</option>
                <option value="SCREENSHOT">Screenshot</option>
                <option value="SIGNATURE">Signature</option>
                <option value="WITNESS_RECORD">Witness record</option>
                <option value="INCIDENT_FILE">Incident file</option>
                <option value="OTHER">Other</option>
              </SelectField>
              <Input name="title" placeholder="Evidence title" required />
              <Input name="subjectName" placeholder="Subject or case name" />
              {scopeFields}
              <Input name="sourceUrl" placeholder="Secure source URL or storage reference" />
              <Textarea name="summary" placeholder="Evidence summary, chain of custody note, witness context, or incident description" required />
              <Button type="submit" disabled={loading === "EVIDENCE"}>
                {loading === "EVIDENCE" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gavel className="h-4 w-4" />}
                Save evidence
              </Button>
            </div>
          </form>
          <div className="space-y-3">
            {data.evidence.map((item) => (
              <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft" key={item.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-ink">{item.title}</p>
                    <p className="mt-1 text-xs text-ink/50">{titleCase(item.evidenceType)} - {item.subjectName ?? "No subject"} - {formatDate(item.createdAt)}</p>
                  </div>
                  <Badge>{titleCase(item.status)}</Badge>
                </div>
                <p className="mt-3 whitespace-pre-wrap rounded-md border border-ink/10 bg-white p-3 text-sm leading-6 text-ink/65">{item.summary}</p>
                {item.sourceUrl ? <p className="mt-2 truncate text-xs text-moss">{item.sourceUrl}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  {["LEGAL_HOLD", "OPEN", "ARCHIVED", "RELEASED"].map((status) => (
                    <Button
                      className="h-8 px-3 text-xs"
                      key={status}
                      variant={status === "RELEASED" ? "danger" : "secondary"}
                      onClick={() => void submitPatch("EVIDENCE", item.id, { status, legalHold: status === "LEGAL_HOLD" ? true : item.legalHold }, `Evidence marked ${titleCase(status)}.`)}
                    >
                      {status === "ARCHIVED" ? <Archive className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                      {titleCase(status)}
                    </Button>
                  ))}
                </div>
              </div>
            ))}
            {data.evidence.length === 0 ? <p className="rounded-lg border border-ink/10 bg-white p-8 text-sm text-ink/55">No confidential evidence records yet.</p> : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}
