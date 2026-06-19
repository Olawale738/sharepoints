"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  HeartHandshake,
  FileText,
  Loader2,
  Pencil,
  RotateCcw,
  Save,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  UsersRound
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type FieldDefinition = {
  key: string;
  label: string;
  type: "text" | "tel" | "date" | "long_text" | "list";
};

type Assignment = {
  id: string;
  status: string;
  effectiveStatus: string;
  answers: Record<string, string | string[]> | null;
  completionPercent: number;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  exceptionRequestedAt: string | null;
  exceptionCategory: string | null;
  reminderCount: number;
  campaign: {
    id: string;
    title: string;
    description: string | null;
    requiredFields: string[];
    status: string;
    dueAt: string;
    requiresReview: boolean;
    allowCareException: boolean;
    createdBy: { name: string | null; email: string | null };
  };
  sanctions: Array<{
    id: string;
    type: string;
    reason: string;
    expiresAt: string | null;
  }>;
};

type AdminAssignment = Omit<Assignment, "campaign"> & {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    department: { name: string } | null;
    workspaceMemberships: Array<{ role: string }>;
  };
};

type SubmissionAnswer = string | number | boolean | string[];

type WorkspaceFormSubmission = {
  id: string;
  answers: Record<string, SubmissionAnswer>;
  approvalStatus: string;
  signatureName: string | null;
  paymentReference: string | null;
  createdAt: string;
  updatedAt: string;
  respondent: { id: string; name: string | null; email: string | null; image: string | null };
  form: {
    id: string;
    title: string;
    fields: Array<{ id: string; label: string; type: string }>;
    workspace: { id: string; name: string };
  };
};

type Campaign = {
  id: string;
  title: string;
  description: string | null;
  requiredFields: string[];
  status: string;
  audienceType: string;
  dueAt: string;
  requiresReview: boolean;
  allowCareException: boolean;
  assignments: AdminAssignment[];
};

type ComplianceData = {
  isAdmin: boolean;
  fieldCatalog: FieldDefinition[];
  profileAnswers: Record<string, string | string[]>;
  assignments: Assignment[];
  admin: {
    campaigns: Campaign[];
    users: Array<{ id: string; name: string | null; email: string | null; departmentId: string | null }>;
    departments: Array<{ id: string; name: string; kind: string }>;
    workspaces: Array<{ id: string; name: string }>;
    sanctions: Array<{
      id: string;
      type: string;
      reason: string;
      createdAt: string;
      expiresAt: string | null;
      user: { name: string | null; email: string | null };
      issuedBy: { name: string | null; email: string | null };
    }>;
    workspaceFormResponses: WorkspaceFormSubmission[];
  } | null;
};

const statusClasses: Record<string, string> = {
  PENDING: "bg-wheat",
  OVERDUE: "bg-clay/10 text-clay",
  SUBMITTED: "bg-sky-100 text-sky-800",
  APPROVED: "bg-mint",
  CHANGES_REQUESTED: "bg-wheat",
  EXEMPT: "bg-ink/10 text-ink/60",
  SANCTIONED: "bg-clay/10 text-clay"
};

function displayStatus(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

function dateTimeLocal(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function fieldValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.join(", ") : value ?? "";
}

function SubmittedAnswerEditor({
  fields,
  initialAnswers,
  busy,
  onSave,
  onDelete
}: {
  fields: Array<{ key: string; label: string }>;
  initialAnswers: Record<string, SubmissionAnswer>;
  busy: boolean;
  onSave: (answers: Record<string, SubmissionAnswer>) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialAnswers);

  useEffect(() => setDraft(initialAnswers), [initialAnswers]);

  return (
    <div className="mt-3 space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {fields.map((field) => {
          const rawValue = draft[field.key];
          const displayValue = Array.isArray(rawValue) ? rawValue.join(", ") : String(rawValue ?? "");
          return (
            <label className="space-y-1 text-xs font-medium text-ink/60" key={field.key}>
              <span>{field.label}</span>
              {editing ? (
                <Input
                  value={displayValue}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      [field.key]: Array.isArray(rawValue)
                        ? event.target.value.split(",").map((item) => item.trim()).filter(Boolean)
                        : event.target.value
                    }))
                  }
                />
              ) : (
                <p className="min-h-10 rounded-md border border-ink/10 bg-paper px-3 py-2 text-sm font-normal text-ink">
                  {displayValue || "Not provided"}
                </p>
              )}
            </label>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2">
        {editing ? (
          <Button disabled={busy} onClick={() => void onSave(draft)}>
            <Save className="h-4 w-4" />Save changes
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => setEditing(true)}>
            <Pencil className="h-4 w-4" />Edit submission
          </Button>
        )}
        {editing ? <Button variant="ghost" onClick={() => { setDraft(initialAnswers); setEditing(false); }}>Cancel</Button> : null}
        <Button
          variant="danger"
          disabled={busy}
          onClick={() => {
            if (window.confirm("Delete this submitted form? This cannot be undone.")) void onDelete();
          }}
        >
          <Trash2 className="h-4 w-4" />Delete submission
        </Button>
      </div>
    </div>
  );
}

export function ComplianceCenter() {
  const [data, setData] = useState<ComplianceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState("");
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [audienceType, setAudienceType] = useState("ALL_ACTIVE");
  const [audienceReferenceId, setAudienceReferenceId] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [exceptionCategory, setExceptionCategory] = useState("CARE");
  const [exceptionNote, setExceptionNote] = useState("");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [sanctionTypes, setSanctionTypes] = useState<Record<string, string>>({});
  const [liftReason, setLiftReason] = useState("Requirement completed and restriction reviewed by an administrator.");

  const load = useCallback(async () => {
    const response = await fetch("/api/compliance");
    const next = (await response.json().catch(() => null)) as ComplianceData & { error?: string };
    setLoading(false);
    if (!response.ok) {
      setError(next?.error ?? "Required forms could not load.");
      return;
    }
    setData(next);
    setSelectedAssignmentId((current) => current || next.assignments[0]?.id || "");
    setSelectedCampaignId((current) => current || next.admin?.campaigns[0]?.id || "");
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeAssignment = data?.assignments.find((assignment) => assignment.id === selectedAssignmentId);
  const activeCampaign = data?.admin?.campaigns.find((campaign) => campaign.id === selectedCampaignId);
  const fieldMap = useMemo(
    () => new Map((data?.fieldCatalog ?? []).map((field) => [field.key, field])),
    [data?.fieldCatalog]
  );

  useEffect(() => {
    if (!activeAssignment || !data) return;
    setAnswers({
      ...data.profileAnswers,
      ...(activeAssignment.answers ?? {})
    });
  }, [activeAssignment, data]);

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy("create");
    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/compliance/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: String(formData.get("title")),
        description: String(formData.get("description") ?? ""),
        requiredFields: selectedFields,
        audienceType,
        audienceReferenceId: audienceReferenceId || null,
        selectedUserIds,
        dueAt: new Date(String(formData.get("dueAt"))).toISOString(),
        requiresReview: formData.get("requiresReview") === "on",
        allowCareException: formData.get("allowCareException") === "on",
        reminderIntervalDays: Number(formData.get("reminderIntervalDays") ?? 3),
        launchNow: formData.get("launchNow") === "on"
      })
    });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(result?.error ?? "Campaign could not be created.");
      return;
    }
    event.currentTarget.reset();
    setSelectedFields([]);
    setSelectedUserIds([]);
    setAudienceType("ALL_ACTIVE");
    setAudienceReferenceId("");
    setMessage("Required form campaign created and notifications queued.");
    await load();
  }

  async function submitAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeAssignment) return;
    setBusy(activeAssignment.id);
    setError("");
    const response = await fetch(`/api/compliance/assignments/${activeAssignment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "SUBMIT", answers })
    });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(result?.error ?? "Your information could not be submitted.");
      return;
    }
    setMessage("Your information was submitted successfully.");
    await load();
  }

  async function requestException() {
    if (!activeAssignment) return;
    setBusy(`exception-${activeAssignment.id}`);
    setError("");
    const response = await fetch(`/api/compliance/assignments/${activeAssignment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "REQUEST_EXCEPTION", category: exceptionCategory, note: exceptionNote })
    });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(result?.error ?? "Your exception request could not be sent.");
      return;
    }
    setExceptionNote("");
    setMessage("Your private care exception request was sent to administrators.");
    await load();
  }

  async function campaignAction(campaignId: string, action: "LAUNCH" | "REMIND" | "CLOSE") {
    setBusy(`${action}-${campaignId}`);
    setError("");
    const response = await fetch(`/api/compliance/campaigns/${campaignId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action })
    });
    const result = (await response.json().catch(() => null)) as { error?: string; notified?: number } | null;
    setBusy("");
    if (!response.ok) {
      setError(result?.error ?? "Campaign action failed.");
      return;
    }
    setMessage(action === "REMIND" ? `${result?.notified ?? 0} reminder notifications sent.` : `Campaign ${action.toLowerCase()}ed.`);
    await load();
  }

  async function assignmentAction(
    assignmentId: string,
    action: "APPROVE" | "REQUEST_CHANGES" | "EXEMPT" | "SANCTION"
  ) {
    const note = reviewNotes[assignmentId] ?? "";
    setBusy(`${action}-${assignmentId}`);
    setError("");
    const body =
      action === "SANCTION"
        ? {
            action,
            sanctionType: sanctionTypes[assignmentId] ?? "WARNING",
            reason: note,
            expiresAt: null
          }
        : { action, note };
    const response = await fetch(`/api/compliance/assignments/${assignmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(result?.error ?? "Member action failed.");
      return;
    }
    setReviewNotes((current) => ({ ...current, [assignmentId]: "" }));
    setMessage(`Member assignment ${displayStatus(action)}.`);
    await load();
  }

  async function liftSanction(sanctionId: string) {
    setBusy(`lift-${sanctionId}`);
    setError("");
    const response = await fetch(`/api/compliance/sanctions/${sanctionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: liftReason })
    });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(result?.error ?? "Restriction could not be lifted.");
      return;
    }
    setMessage("Member restriction lifted.");
    await load();
  }

  async function editComplianceSubmission(assignmentId: string, nextAnswers: Record<string, SubmissionAnswer>) {
    setBusy(`edit-${assignmentId}`);
    setError("");
    const response = await fetch(`/api/compliance/assignments/${assignmentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ADMIN_EDIT", answers: nextAnswers, note: "Submission corrected by an administrator." })
    });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(result?.error ?? "Submitted member information could not be edited.");
      return;
    }
    setMessage("Submitted member information updated.");
    await load();
  }

  async function deleteComplianceSubmission(assignmentId: string) {
    setBusy(`delete-${assignmentId}`);
    setError("");
    const response = await fetch(`/api/compliance/assignments/${assignmentId}`, { method: "DELETE" });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(result?.error ?? "Submitted member information could not be deleted.");
      return;
    }
    setMessage("Submitted member information deleted. The security event was preserved.");
    await load();
  }

  async function editWorkspaceSubmission(responseId: string, nextAnswers: Record<string, SubmissionAnswer>) {
    setBusy(`workspace-edit-${responseId}`);
    setError("");
    const response = await fetch(`/api/admin/form-responses/${responseId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: nextAnswers })
    });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(result?.error ?? "Workspace form response could not be edited.");
      return;
    }
    setMessage("Workspace form response updated.");
    await load();
  }

  async function deleteWorkspaceSubmission(responseId: string) {
    setBusy(`workspace-delete-${responseId}`);
    setError("");
    const response = await fetch(`/api/admin/form-responses/${responseId}`, { method: "DELETE" });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(result?.error ?? "Workspace form response could not be deleted.");
      return;
    }
    setMessage("Workspace form response deleted. The security event was preserved.");
    await load();
  }

  if (loading) {
    return <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-moss" /></div>;
  }
  if (!data) return <p className="rounded-md bg-clay/10 p-4 text-sm text-clay">{error}</p>;

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-md bg-clay/10 px-4 py-3 text-sm text-clay">{error}</p> : null}
      {message ? <p className="rounded-md bg-mint px-4 py-3 text-sm text-ink">{message}</p> : null}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border border-ink/10 bg-white p-4">
          <ClipboardCheck className="h-5 w-5 text-moss" />
          <p className="mt-3 text-2xl font-semibold">{data.assignments.length}</p>
          <p className="text-sm text-ink/55">My required forms</p>
        </div>
        <div className="rounded-lg border border-ink/10 bg-white p-4">
          <Clock3 className="h-5 w-5 text-moss" />
          <p className="mt-3 text-2xl font-semibold">{data.assignments.filter((item) => ["PENDING", "OVERDUE", "CHANGES_REQUESTED"].includes(item.effectiveStatus)).length}</p>
          <p className="text-sm text-ink/55">Need my attention</p>
        </div>
        <div className="rounded-lg border border-ink/10 bg-white p-4">
          <HeartHandshake className="h-5 w-5 text-moss" />
          <p className="mt-3 text-2xl font-semibold">{data.assignments.filter((item) => item.exceptionRequestedAt).length}</p>
          <p className="text-sm text-ink/55">Care requests</p>
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-ink/10 bg-white">
        <div className="border-b border-ink/10 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold"><ClipboardCheck className="h-4 w-4 text-moss" />My member-information requests</h2>
        </div>
        <div className="grid min-h-80 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <aside className="border-b border-ink/10 bg-paper p-3 lg:border-b-0 lg:border-r">
            {data.assignments.length === 0 ? <p className="p-3 text-sm text-ink/50">No required forms assigned.</p> : null}
            <div className="space-y-2">
              {data.assignments.map((assignment) => (
                <button
                  className={`w-full rounded-md border px-3 py-3 text-left ${selectedAssignmentId === assignment.id ? "border-moss bg-mint/60" : "border-ink/10 bg-white"}`}
                  key={assignment.id}
                  onClick={() => setSelectedAssignmentId(assignment.id)}
                  type="button"
                >
                  <p className="text-sm font-semibold">{assignment.campaign.title}</p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <Badge className={statusClasses[assignment.effectiveStatus]}>{displayStatus(assignment.effectiveStatus)}</Badge>
                    <span className="text-[11px] text-ink/45">{new Date(assignment.campaign.dueAt).toLocaleDateString()}</span>
                  </div>
                </button>
              ))}
            </div>
          </aside>
          <div className="p-5">
            {activeAssignment ? (
              <div>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-semibold">{activeAssignment.campaign.title}</h3>
                    <p className="mt-1 text-sm text-ink/55">{activeAssignment.campaign.description}</p>
                    <p className="mt-2 text-xs text-ink/45">Due {new Date(activeAssignment.campaign.dueAt).toLocaleString()}</p>
                  </div>
                  <Badge className={statusClasses[activeAssignment.effectiveStatus]}>{displayStatus(activeAssignment.effectiveStatus)}</Badge>
                </div>
                {activeAssignment.sanctions.length ? (
                  <div className="mt-4 rounded-md border border-clay/20 bg-clay/10 p-3 text-sm text-clay">
                    <p className="font-semibold">Active account restriction</p>
                    {activeAssignment.sanctions.map((sanction) => <p className="mt-1" key={sanction.id}>{displayStatus(sanction.type)}: {sanction.reason}</p>)}
                  </div>
                ) : null}
                <form className="mt-5 space-y-4" onSubmit={submitAssignment}>
                  {activeAssignment.campaign.requiredFields.map((key) => {
                    const field = fieldMap.get(key);
                    if (!field) return null;
                    const value = fieldValue(answers[key]);
                    return (
                      <label className="block space-y-1 text-sm font-medium" key={key}>
                        <span>{field.label} *</span>
                        {field.type === "long_text" ? (
                          <Textarea value={value} onChange={(event) => setAnswers((current) => ({ ...current, [key]: event.target.value }))} />
                        ) : (
                          <Input
                            type={field.type === "date" ? "date" : field.type === "tel" ? "tel" : "text"}
                            value={value}
                            onChange={(event) =>
                              setAnswers((current) => ({
                                ...current,
                                [key]: field.type === "list" ? event.target.value.split(",").map((item) => item.trim()).filter(Boolean) : event.target.value
                              }))
                            }
                            placeholder={field.type === "list" ? "Separate items with commas" : undefined}
                          />
                        )}
                      </label>
                    );
                  })}
                  {["PENDING", "OVERDUE", "CHANGES_REQUESTED", "SANCTIONED"].includes(activeAssignment.effectiveStatus) ? (
                    <Button disabled={busy === activeAssignment.id} type="submit">
                      {busy === activeAssignment.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Submit information
                    </Button>
                  ) : null}
                </form>
                {activeAssignment.campaign.allowCareException && !activeAssignment.exceptionRequestedAt ? (
                  <div className="mt-6 rounded-lg border border-moss/20 bg-mint/30 p-4">
                    <p className="flex items-center gap-2 text-sm font-semibold"><HeartHandshake className="h-4 w-4 text-moss" />Private care exception</p>
                    <p className="mt-1 text-xs text-ink/55">Request extra time or an exemption without placing sensitive details in the public activity log.</p>
                    <div className="mt-3 grid gap-2 md:grid-cols-[12rem_minmax(0,1fr)_auto]">
                      <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" value={exceptionCategory} onChange={(event) => setExceptionCategory(event.target.value)}>
                        <option value="CARE">Care responsibilities</option>
                        <option value="HEALTH">Health</option>
                        <option value="ACCESSIBILITY">Accessibility</option>
                        <option value="TRAVEL">Travel</option>
                        <option value="TECHNICAL">Technical difficulty</option>
                        <option value="OTHER">Other</option>
                      </select>
                      <Input value={exceptionNote} onChange={(event) => setExceptionNote(event.target.value)} placeholder="Private note to administrators" />
                      <Button variant="secondary" disabled={exceptionNote.trim().length < 3 || busy === `exception-${activeAssignment.id}`} onClick={requestException}>
                        Request
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : <p className="text-sm text-ink/50">Select a required form.</p>}
          </div>
        </div>
      </section>

      {data.isAdmin && data.admin ? (
        <>
          <section className="rounded-lg border border-ink/10 bg-white">
            <div className="border-b border-ink/10 px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><FileText className="h-4 w-4 text-moss" />All submitted forms</h2>
              <p className="mt-1 text-xs text-ink/50">View, correct, or delete every required-information and workspace form submitted across LETW.ORG.</p>
            </div>
            <div className="grid gap-5 p-4 xl:grid-cols-2">
              <div>
                <h3 className="text-sm font-semibold">Required member information</h3>
                <div className="mt-3 max-h-[42rem] space-y-2 overflow-y-auto">
                  {data.admin.campaigns.flatMap((campaign) =>
                    campaign.assignments
                      .filter((assignment) => Boolean(assignment.answers || assignment.submittedAt))
                      .map((assignment) => (
                        <details className="rounded-md border border-ink/10 bg-paper p-3" key={assignment.id}>
                          <summary className="cursor-pointer list-none">
                            <div className="flex items-center gap-3">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              {assignment.user.image ? <img alt="" className="h-10 w-10 rounded-md object-cover" src={assignment.user.image} /> : <span className="flex h-10 w-10 items-center justify-center rounded-md bg-mint text-sm font-semibold">{(assignment.user.name ?? assignment.user.email ?? "M").slice(0, 1)}</span>}
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-semibold">{assignment.user.name ?? assignment.user.email}</p>
                                <p className="truncate text-xs text-ink/50">{campaign.title} - {assignment.submittedAt ? new Date(assignment.submittedAt).toLocaleString() : "saved response"}</p>
                              </div>
                              <Badge className={statusClasses[assignment.effectiveStatus]}>{displayStatus(assignment.effectiveStatus)}</Badge>
                            </div>
                          </summary>
                          <SubmittedAnswerEditor
                            fields={campaign.requiredFields.map((key) => ({ key, label: fieldMap.get(key)?.label ?? key }))}
                            initialAnswers={(assignment.answers ?? {}) as Record<string, SubmissionAnswer>}
                            busy={busy.endsWith(assignment.id)}
                            onSave={(nextAnswers) => editComplianceSubmission(assignment.id, nextAnswers)}
                            onDelete={() => deleteComplianceSubmission(assignment.id)}
                          />
                        </details>
                      ))
                  )}
                  {data.admin.campaigns.every((campaign) => campaign.assignments.every((assignment) => !assignment.answers && !assignment.submittedAt)) ? <p className="rounded-md bg-paper p-4 text-sm text-ink/50">No required-information submissions yet.</p> : null}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Workspace form submissions</h3>
                <div className="mt-3 max-h-[42rem] space-y-2 overflow-y-auto">
                  {data.admin.workspaceFormResponses.map((submission) => (
                    <details className="rounded-md border border-ink/10 bg-paper p-3" key={submission.id}>
                      <summary className="cursor-pointer list-none">
                        <div className="flex items-center gap-3">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {submission.respondent.image ? <img alt="" className="h-10 w-10 rounded-md object-cover" src={submission.respondent.image} /> : <span className="flex h-10 w-10 items-center justify-center rounded-md bg-mint text-sm font-semibold">{(submission.respondent.name ?? submission.respondent.email ?? "M").slice(0, 1)}</span>}
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{submission.respondent.name ?? submission.respondent.email}</p>
                            <p className="truncate text-xs text-ink/50">{submission.form.title} - {submission.form.workspace.name} - {new Date(submission.updatedAt).toLocaleString()}</p>
                          </div>
                          <Badge>{displayStatus(submission.approvalStatus)}</Badge>
                        </div>
                      </summary>
                      <SubmittedAnswerEditor
                        fields={(Array.isArray(submission.form.fields) ? submission.form.fields : []).map((field) => ({ key: field.id, label: field.label }))}
                        initialAnswers={submission.answers}
                        busy={busy.endsWith(submission.id)}
                        onSave={(nextAnswers) => editWorkspaceSubmission(submission.id, nextAnswers)}
                        onDelete={() => deleteWorkspaceSubmission(submission.id)}
                      />
                    </details>
                  ))}
                  {data.admin.workspaceFormResponses.length === 0 ? <p className="rounded-md bg-paper p-4 text-sm text-ink/50">No workspace form submissions yet.</p> : null}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-lg border border-ink/10 bg-white p-5">
            <p className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-moss" />Create accountability campaign</p>
            <form className="mt-4 space-y-4" onSubmit={createCampaign}>
              <div className="grid gap-3 md:grid-cols-2">
                <Input name="title" placeholder="Required information campaign title" required />
                <Input name="dueAt" type="datetime-local" min={dateTimeLocal(new Date(Date.now() + 60_000))} defaultValue={dateTimeLocal(new Date(Date.now() + 7 * 86_400_000))} required />
                <Textarea className="md:col-span-2" name="description" placeholder="Explain why this information is needed and how it will be used." />
              </div>
              <div>
                <p className="text-xs font-semibold text-ink/60">Information members must complete</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {data.fieldCatalog.map((field) => (
                    <label className="flex items-center gap-2 rounded-md border border-ink/10 bg-paper px-3 py-2 text-sm" key={field.key}>
                      <input
                        className="h-4 w-4 accent-moss"
                        type="checkbox"
                        checked={selectedFields.includes(field.key)}
                        onChange={(event) => setSelectedFields((current) => event.target.checked ? [...current, field.key] : current.filter((key) => key !== field.key))}
                      />
                      {field.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="text-xs font-medium text-ink/60">Audience
                  <select className="mt-1 h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" value={audienceType} onChange={(event) => { setAudienceType(event.target.value); setAudienceReferenceId(""); }}>
                    <option value="ALL_ACTIVE">All active members</option>
                    <option value="DEPARTMENT">One department/unit</option>
                    <option value="WORKSPACE">One workspace</option>
                    <option value="SELECTED">Selected members</option>
                  </select>
                </label>
                {audienceType === "DEPARTMENT" ? (
                  <label className="text-xs font-medium text-ink/60">Department
                    <select className="mt-1 h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" value={audienceReferenceId} onChange={(event) => setAudienceReferenceId(event.target.value)}>
                      <option value="">Choose department</option>
                      {data.admin.departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </label>
                ) : null}
                {audienceType === "WORKSPACE" ? (
                  <label className="text-xs font-medium text-ink/60">Workspace
                    <select className="mt-1 h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" value={audienceReferenceId} onChange={(event) => setAudienceReferenceId(event.target.value)}>
                      <option value="">Choose workspace</option>
                      {data.admin.workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </label>
                ) : null}
                <label className="text-xs font-medium text-ink/60">Reminder interval
                  <Input className="mt-1" name="reminderIntervalDays" type="number" min="1" max="30" defaultValue="3" />
                </label>
              </div>
              {audienceType === "SELECTED" ? (
                <div className="max-h-48 overflow-y-auto rounded-md border border-ink/10 p-2">
                  {data.admin.users.map((user) => (
                    <label className="flex items-center gap-2 px-2 py-2 text-sm" key={user.id}>
                      <input type="checkbox" checked={selectedUserIds.includes(user.id)} onChange={(event) => setSelectedUserIds((current) => event.target.checked ? [...current, user.id] : current.filter((id) => id !== user.id))} />
                      {user.name ?? user.email} <span className="text-xs text-ink/40">{user.email}</span>
                    </label>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-wrap gap-4 rounded-md bg-paper p-3 text-sm">
                <label className="flex items-center gap-2"><input name="requiresReview" type="checkbox" defaultChecked />Admin review before CRM update</label>
                <label className="flex items-center gap-2"><input name="allowCareException" type="checkbox" defaultChecked />Allow private care exception</label>
                <label className="flex items-center gap-2"><input name="launchNow" type="checkbox" defaultChecked />Send notifications now</label>
              </div>
              <Button type="submit" disabled={busy === "create" || selectedFields.length === 0}>
                {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
                Create and notify
              </Button>
            </form>
          </section>

          <section className="grid gap-5 xl:grid-cols-[19rem_minmax(0,1fr)]">
            <aside className="rounded-lg border border-ink/10 bg-white p-3">
              <h2 className="flex items-center gap-2 px-2 py-2 text-sm font-semibold"><UsersRound className="h-4 w-4 text-moss" />Campaigns</h2>
              <div className="space-y-2">
                {data.admin.campaigns.map((campaign) => {
                  const overdue = campaign.assignments.filter((item) => item.effectiveStatus === "OVERDUE").length;
                  const exceptions = campaign.assignments.filter((item) => item.exceptionRequestedAt && item.status !== "EXEMPT").length;
                  return (
                    <button className={`w-full rounded-md border p-3 text-left ${selectedCampaignId === campaign.id ? "border-moss bg-mint/50" : "border-ink/10 bg-paper"}`} key={campaign.id} onClick={() => setSelectedCampaignId(campaign.id)} type="button">
                      <p className="text-sm font-semibold">{campaign.title}</p>
                      <p className="mt-1 text-xs text-ink/45">{campaign.assignments.length} members</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {overdue ? <Badge className="bg-clay/10 text-clay">{overdue} overdue</Badge> : null}
                        {exceptions ? <Badge className="bg-wheat">{exceptions} care</Badge> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>
            <div className="rounded-lg border border-ink/10 bg-white">
              {activeCampaign ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-ink/10 p-4">
                    <div>
                      <h2 className="text-xl font-semibold">{activeCampaign.title}</h2>
                      <p className="mt-1 text-xs text-ink/45">Due {new Date(activeCampaign.dueAt).toLocaleString()} - {displayStatus(activeCampaign.status)}</p>
                    </div>
                    <div className="flex gap-2">
                      {activeCampaign.status === "DRAFT" ? <Button variant="secondary" onClick={() => campaignAction(activeCampaign.id, "LAUNCH")}>Launch</Button> : null}
                      {activeCampaign.status === "ACTIVE" ? (
                        <>
                          <Button variant="secondary" onClick={() => campaignAction(activeCampaign.id, "REMIND")}><BellRing className="h-4 w-4" />Remind pending</Button>
                          <Button variant="secondary" onClick={() => campaignAction(activeCampaign.id, "CLOSE")}>Close</Button>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="grid gap-3 border-b border-ink/10 bg-paper p-4 sm:grid-cols-4">
                    {[
                      ["Approved", activeCampaign.assignments.filter((item) => item.status === "APPROVED").length],
                      ["Submitted", activeCampaign.assignments.filter((item) => item.status === "SUBMITTED").length],
                      ["Overdue", activeCampaign.assignments.filter((item) => item.effectiveStatus === "OVERDUE").length],
                      ["Care review", activeCampaign.assignments.filter((item) => item.exceptionRequestedAt && item.status !== "EXEMPT").length]
                    ].map(([label, value]) => <div key={label}><p className="text-xl font-semibold">{value}</p><p className="text-xs text-ink/50">{label}</p></div>)}
                  </div>
                  <div className="divide-y divide-ink/10">
                    {activeCampaign.assignments.map((assignment) => {
                      const isAdminMember = assignment.user.workspaceMemberships.some((membership) => membership.role === "ADMIN");
                      return (
                        <div className="p-4" key={assignment.id}>
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-sm font-semibold">{assignment.user.name ?? assignment.user.email}</p>
                                <Badge className={statusClasses[assignment.effectiveStatus]}>{displayStatus(assignment.effectiveStatus)}</Badge>
                                {isAdminMember ? <Badge className="bg-moss text-white">admin protected</Badge> : null}
                                {assignment.exceptionRequestedAt ? <Badge className="bg-wheat">care exception</Badge> : null}
                              </div>
                              <p className="mt-1 text-xs text-ink/45">{assignment.user.email} {assignment.user.department ? `- ${assignment.user.department.name}` : ""}</p>
                              {assignment.exceptionRequestedAt ? <p className="mt-2 text-xs text-ink/60">Private exception category: {displayStatus(assignment.exceptionCategory ?? "care")}</p> : null}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {assignment.status === "SUBMITTED" ? <Button className="h-9" onClick={() => assignmentAction(assignment.id, "APPROVE")}><CheckCircle2 className="h-4 w-4" />Approve</Button> : null}
                              {assignment.status === "SUBMITTED" ? <Button className="h-9" variant="secondary" onClick={() => assignmentAction(assignment.id, "REQUEST_CHANGES")}>Request changes</Button> : null}
                              {assignment.exceptionRequestedAt && assignment.status !== "EXEMPT" ? <Button className="h-9" variant="secondary" onClick={() => assignmentAction(assignment.id, "EXEMPT")}><HeartHandshake className="h-4 w-4" />Exempt</Button> : null}
                            </div>
                          </div>
                          {["SUBMITTED", "PENDING", "CHANGES_REQUESTED", "SANCTIONED"].includes(assignment.status) ? (
                            <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_10rem_auto]">
                              <Input value={reviewNotes[assignment.id] ?? ""} onChange={(event) => setReviewNotes((current) => ({ ...current, [assignment.id]: event.target.value }))} placeholder="Review note, exemption reason, or sanction reason" />
                              <select className="h-10 rounded-md border border-ink/10 bg-white px-2 text-xs" value={sanctionTypes[assignment.id] ?? "WARNING"} onChange={(event) => setSanctionTypes((current) => ({ ...current, [assignment.id]: event.target.value }))}>
                                <option value="WARNING">Warning only</option>
                                <option value="RESTRICT_CHAT">Restrict chat</option>
                                <option value="RESTRICT_FILES">Restrict files</option>
                              </select>
                              <Button
                                variant="danger"
                                disabled={
                                  isAdminMember ||
                                  Boolean(assignment.exceptionRequestedAt) ||
                                  assignment.effectiveStatus !== "OVERDUE" ||
                                  (reviewNotes[assignment.id] ?? "").trim().length < 3
                                }
                                onClick={() => assignmentAction(assignment.id, "SANCTION")}
                              >
                                <ShieldAlert className="h-4 w-4" />
                                Sanction
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : <p className="p-8 text-sm text-ink/50">Create or select a campaign.</p>}
            </div>
          </section>

          <section className="rounded-lg border border-ink/10 bg-white">
            <div className="border-b border-ink/10 px-4 py-3">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4 text-clay" />Active sanctions</h2>
            </div>
            <div className="border-b border-ink/10 bg-paper p-3">
              <Input value={liftReason} onChange={(event) => setLiftReason(event.target.value)} placeholder="Reason for lifting a restriction" />
            </div>
            <div className="divide-y divide-ink/10">
              {data.admin.sanctions.length === 0 ? <p className="p-6 text-sm text-ink/50">No active sanctions.</p> : null}
              {data.admin.sanctions.map((sanction) => (
                <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between" key={sanction.id}>
                  <div>
                    <p className="text-sm font-semibold">{sanction.user.name ?? sanction.user.email}</p>
                    <p className="text-xs text-ink/55">{displayStatus(sanction.type)} - {sanction.reason}</p>
                  </div>
                  <Button variant="secondary" disabled={liftReason.trim().length < 3 || busy === `lift-${sanction.id}`} onClick={() => liftSanction(sanction.id)}>
                    <RotateCcw className="h-4 w-4" />
                    Lift restriction
                  </Button>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
