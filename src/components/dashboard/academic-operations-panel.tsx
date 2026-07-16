"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Award, BadgeCheck, BookOpenCheck, ClipboardCheck, GraduationCap, Loader2, Printer, RefreshCw, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Candidate = {
  id: string;
  fullName: string;
  email?: string | null;
  programName: string;
  educationLevel: string;
  clearanceStatus: string;
  photoUrl?: string | null;
  nameVerified: boolean;
  coursesCompleted: boolean;
  rectorApproved: boolean;
};

type Board = {
  id: string;
  title: string;
  programName?: string | null;
  educationLevel?: string | null;
  status: string;
  boardDate?: string | Date | null;
  notes?: string | null;
  reviewNote?: string | null;
};

type BoardCandidate = {
  id: string;
  boardId: string;
  candidateId: string;
  status: string;
};

type Certificate = {
  id: string;
  title: string;
  certificateNumber?: string | null;
  certificateCategory?: string | null;
  recipientName?: string | null;
  recipientEmail?: string | null;
  academicCandidateId?: string | null;
  status: string;
};

type Correction = {
  id: string;
  certificateId: string;
  academicCandidateId?: string | null;
  requesterName?: string | null;
  requesterEmail?: string | null;
  correctionType: string;
  requestedChanges: Record<string, unknown>;
  reason?: string | null;
  status: string;
  reviewNote?: string | null;
  replacementCertificateId?: string | null;
  createdAt: string | Date;
};

type PrintLog = {
  id: string;
  certificateId: string;
  status: string;
  method?: string | null;
  trackingCode?: string | null;
  collectedBy?: string | null;
  notes?: string | null;
  createdAt: string | Date;
};

type MinistryLicense = {
  id: string;
  userId?: string | null;
  holderName: string;
  holderEmail?: string | null;
  holderPhone?: string | null;
  licenseType: string;
  licenseNumber: string;
  scope?: string | null;
  status: string;
  issuedAt: string | Date;
  expiresAt?: string | Date | null;
};

type UserOption = { id: string; name?: string | null; email?: string | null };
type MinistryOption = { id: string; name: string };
type WorkspaceOption = { id: string; name: string };
type UnitOption = { id: string; name: string; type: string };

type AuditRun = {
  id: string;
  title: string;
  summary?: string | null;
  counts?: unknown;
  createdAt: string | Date;
};

type AuditFinding = {
  id: string;
  severity: string;
  findingType: string;
  title: string;
  detail: string;
  candidateId?: string | null;
  certificateId?: string | null;
  status: string;
};

function formText(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function dateIso(formData: FormData, name: string) {
  const value = formText(formData, name);
  return value ? new Date(value).toISOString() : null;
}

function formatDate(value?: string | Date | null) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function statusClass(status: string) {
  const normalized = status.toUpperCase();
  if (["ACTIVE", "APPROVED", "CLEARED", "COMPLETED", "PRINTED", "COLLECTED"].includes(normalized)) return "bg-mint text-moss";
  if (["DRAFT", "PENDING", "READY_FOR_PRINT", "MAILED", "UNCOLLECTED", "RENEWED"].includes(normalized)) return "bg-[#fff6d8] text-[#7c5d00]";
  return "bg-clay/10 text-clay";
}

function changeSummary(changes: Record<string, unknown>) {
  const labels: Record<string, string> = {
    recipientName: "Name",
    completionDate: "Date",
    recipientPhotoUrl: "Photo",
    educationLevel: "Level",
    programName: "Program",
    fieldOfStudy: "Field",
    gradeOrHonors: "Grade",
    signatureNote: "Signature note"
  };
  const parts = Object.entries(changes)
    .filter(([, value]) => typeof value === "string" && value.trim())
    .map(([key, value]) => `${labels[key] ?? key}: ${String(value)}`);
  return parts.length ? parts.join(" | ") : "No correction details recorded.";
}

function certificateLabel(certificate?: Certificate | null) {
  if (!certificate) return "Unknown certificate";
  return `${certificate.certificateNumber ?? certificate.title} - ${certificate.recipientName ?? certificate.recipientEmail ?? "holder"}`;
}

async function jsonRequest(url: string, method: string, body?: unknown) {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new Error(data?.error ?? "Request failed.");
  return data;
}

export function AcademicOperationsPanel({
  canAcademic,
  canMinistryLicense,
  candidates,
  boards,
  boardCandidates,
  certificates,
  corrections,
  printLogs,
  ministryLicenses,
  users,
  ministries,
  workspaces,
  units,
  auditRuns,
  auditFindings,
  setupWarning
}: {
  canAcademic: boolean;
  canMinistryLicense: boolean;
  candidates: Candidate[];
  boards: Board[];
  boardCandidates: BoardCandidate[];
  certificates: Certificate[];
  corrections: Correction[];
  printLogs: PrintLog[];
  ministryLicenses: MinistryLicense[];
  users: UserOption[];
  ministries: MinistryOption[];
  workspaces: WorkspaceOption[];
  units: UnitOption[];
  auditRuns: AuditRun[];
  auditFindings: AuditFinding[];
  setupWarning?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const certificatesById = new Map(certificates.map((certificate) => [certificate.id, certificate]));
  const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  async function runAction(label: string, action: () => Promise<void>) {
    setBusy(label);
    setNotice("");
    setError("");
    try {
      await action();
      setBusy("");
      router.refresh();
    } catch (caught) {
      setBusy("");
      setError(caught instanceof Error ? caught.message : "Action failed.");
    }
  }

  async function createBoard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    await runAction("board-create", async () => {
      await jsonRequest("/api/academic-board", "POST", {
        title: formText(formData, "title"),
        programName: formText(formData, "programName") || null,
        educationLevel: formText(formData, "educationLevel") || null,
        boardDate: dateIso(formData, "boardDate"),
        candidateIds: formData.getAll("candidateIds").map(String),
        notes: formText(formData, "notes") || null,
        submit: formData.get("submit") === "on"
      });
      form.reset();
      setNotice("Graduation board list created.");
    });
  }

  async function boardAction(id: string, action: "SUBMIT" | "APPROVE" | "REJECT") {
    const reviewNote = action === "SUBMIT" ? null : window.prompt(action === "APPROVE" ? "Approval note optional" : "Why is this graduation list rejected?");
    if (action === "REJECT" && !reviewNote?.trim()) return;
    await runAction(`board-${action}-${id}`, async () => {
      await jsonRequest("/api/academic-board", "PATCH", { id, action, reviewNote });
      setNotice(action === "APPROVE" ? "Graduation list approved. Degree certificates can now be issued for these candidates." : "Graduation list updated.");
    });
  }

  async function deleteBoard(id: string) {
    if (!window.confirm("Delete this graduation board list?")) return;
    await runAction(`board-delete-${id}`, async () => {
      await jsonRequest("/api/academic-board", "DELETE", { id });
      setNotice("Graduation board list deleted.");
    });
  }

  async function reviewCorrection(id: string, action: "APPROVE" | "REJECT") {
    const reviewNote = window.prompt(action === "APPROVE" ? "Approval note optional" : "Why is this correction rejected?");
    if (action === "REJECT" && !reviewNote?.trim()) return;
    await runAction(`correction-${action}-${id}`, async () => {
      await jsonRequest(`/api/certificates/corrections/${id}`, "PATCH", { action, reviewNote });
      setNotice(action === "APPROVE" ? "Correction approved and replacement certificate created." : "Correction rejected.");
    });
  }

  async function createPrintLog(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    await runAction("print-create", async () => {
      await jsonRequest("/api/certificates/print-log", "POST", {
        certificateId: formText(formData, "certificateId"),
        status: formText(formData, "status"),
        method: formText(formData, "method") || null,
        trackingCode: formText(formData, "trackingCode") || null,
        collectedBy: formText(formData, "collectedBy") || null,
        notes: formText(formData, "notes") || null
      });
      form.reset();
      setNotice("Print or collection log saved.");
    });
  }

  async function updatePrintLog(id: string, status: string) {
    await runAction(`print-${id}-${status}`, async () => {
      await jsonRequest("/api/certificates/print-log", "PATCH", { id, status });
      setNotice("Print log updated.");
    });
  }

  async function deletePrintLog(id: string) {
    if (!window.confirm("Delete this print log?")) return;
    await runAction(`print-delete-${id}`, async () => {
      await jsonRequest("/api/certificates/print-log", "DELETE", { id });
      setNotice("Print log deleted.");
    });
  }

  async function createLicense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    await runAction("license-create", async () => {
      await jsonRequest("/api/ministry-licenses", "POST", {
        userId: formText(formData, "userId") || null,
        holderName: formText(formData, "holderName"),
        holderEmail: formText(formData, "holderEmail") || null,
        holderPhone: formText(formData, "holderPhone") || null,
        licenseType: formText(formData, "licenseType"),
        scope: formText(formData, "scope") || null,
        ministryId: formText(formData, "ministryId") || null,
        workspaceId: formText(formData, "workspaceId") || null,
        organizationUnitId: formText(formData, "organizationUnitId") || null,
        expiresAt: dateIso(formData, "expiresAt"),
        renewalNote: formText(formData, "renewalNote") || null
      });
      form.reset();
      setNotice("Ministry license issued.");
    });
  }

  async function licenseAction(id: string, action: "RENEW" | "REVOKE" | "RESTORE" | "EXPIRE" | "DELETE") {
    const renewalNote = action === "DELETE" ? null : window.prompt(`${action.toLowerCase()} note optional`) ?? null;
    if (action === "DELETE" && !window.confirm("Delete this ministry license record?")) return;
    await runAction(`license-${id}-${action}`, async () => {
      await jsonRequest("/api/ministry-licenses", "PATCH", { id, action, renewalNote });
      setNotice(action === "RENEW" ? "License renewed and a new license number was issued." : "License updated.");
    });
  }

  async function runAudit() {
    await runAction("audit-run", async () => {
      await jsonRequest("/api/academic-auditor", "POST");
      setNotice("Academic audit completed.");
    });
  }

  async function resolveFinding(id: string) {
    await runAction(`finding-${id}`, async () => {
      await jsonRequest("/api/academic-auditor", "PATCH", { id, status: "RESOLVED" });
      setNotice("Audit finding resolved.");
    });
  }

  return (
    <div className="space-y-6">
      {setupWarning ? (
        <div className="rounded-lg border border-[#d4af37]/40 bg-[#fff8df] p-4 text-sm text-ink shadow-soft">
          <p className="flex items-center gap-2 font-semibold text-[#7c5d00]"><ShieldAlert className="h-4 w-4" />Academic operations setup pending</p>
          <p className="mt-1 text-ink/70">{setupWarning}</p>
        </div>
      ) : null}
      {notice ? <p className="rounded-md border border-moss/15 bg-mint px-4 py-3 text-sm text-moss">{notice}</p> : null}
      {error ? <p className="rounded-md bg-clay/10 px-4 py-3 text-sm text-clay">{error}</p> : null}

      <section className="grid gap-4 md:grid-cols-5">
        {[
          ["Graduation lists", boards.length],
          ["Correction inbox", corrections.filter((item) => item.status === "PENDING").length],
          ["Print logs", printLogs.length],
          ["Ministry licenses", ministryLicenses.length],
          ["Audit findings", auditFindings.filter((item) => item.status === "OPEN").length]
        ].map(([label, value]) => (
          <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft" key={String(label)}>
            <p className="text-2xl font-semibold text-ink">{value}</p>
            <p className="mt-1 text-sm text-ink/55">{label}</p>
          </div>
        ))}
      </section>

      {canAcademic ? (
        <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink"><GraduationCap className="h-4 w-4 text-moss" />Academic Board Approval</p>
            <p className="mt-1 text-xs text-ink/55">Before BSc, MSc, or PhD certificates are issued, candidates must be on an approved graduation list.</p>
            <form className="mt-4 space-y-3" onSubmit={createBoard}>
              <div className="grid gap-2 md:grid-cols-2">
                <Input name="title" placeholder="Graduation list title" required />
                <Input name="boardDate" type="date" />
                <Input name="programName" placeholder="Program name" />
                <Input name="educationLevel" placeholder="Degree level, e.g. BSc" />
              </div>
              <Textarea name="notes" placeholder="Board notes, conditions, or academic remarks" />
              <div className="max-h-56 overflow-auto rounded-md border border-ink/10 bg-paper p-2">
                {candidates.map((candidate) => (
                  <label className="flex items-start gap-2 border-b border-ink/5 py-2 text-xs last:border-0" key={candidate.id}>
                    <input name="candidateIds" type="checkbox" value={candidate.id} />
                    <span>
                      <span className="font-medium text-ink">{candidate.fullName}</span>
                      <span className="block text-ink/55">{candidate.educationLevel} - {candidate.programName} - {candidate.clearanceStatus.toLowerCase()}</span>
                    </span>
                  </label>
                ))}
              </div>
              <label className="flex items-center gap-2 text-xs text-ink/60">
                <input name="submit" type="checkbox" />
                Submit immediately for approval
              </label>
              <Button disabled={busy === "board-create"} type="submit">
                {busy === "board-create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCheck className="h-4 w-4" />}
                Create graduation list
              </Button>
            </form>
          </div>

          <div className="rounded-lg border border-ink/10 bg-white shadow-soft">
            <div className="border-b border-ink/10 p-4">
              <p className="text-sm font-semibold text-ink">Graduation approval lists</p>
            </div>
            <div className="divide-y divide-ink/10">
              {boards.map((board) => {
                const rows = boardCandidates.filter((row) => row.boardId === board.id);
                return (
                  <div className="p-4" key={board.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-ink">{board.title}</p>
                        <p className="mt-1 text-xs text-ink/55">{board.programName ?? "All programs"} - {board.educationLevel ?? "All levels"} - {formatDate(board.boardDate)}</p>
                      </div>
                      <Badge className={statusClass(board.status)}>{board.status.toLowerCase()}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-ink/55">{rows.length} candidate(s): {rows.slice(0, 5).map((row) => candidatesById.get(row.candidateId)?.fullName ?? "Candidate").join(", ")}{rows.length > 5 ? "..." : ""}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {board.status === "DRAFT" ? <Button className="h-8 px-3 text-xs" type="button" variant="secondary" onClick={() => boardAction(board.id, "SUBMIT")}>Submit</Button> : null}
                      {board.status !== "APPROVED" ? <Button className="h-8 px-3 text-xs" type="button" onClick={() => boardAction(board.id, "APPROVE")}>Approve</Button> : null}
                      {board.status !== "REJECTED" ? <Button className="h-8 px-3 text-xs" type="button" variant="ghost" onClick={() => boardAction(board.id, "REJECT")}>Reject</Button> : null}
                      <Button className="h-8 px-2 text-xs" type="button" variant="ghost" onClick={() => deleteBoard(board.id)}><Trash2 className="h-3.5 w-3.5" />Delete</Button>
                    </div>
                  </div>
                );
              })}
              {boards.length === 0 ? <p className="p-6 text-sm text-ink/55">No academic board lists yet.</p> : null}
            </div>
          </div>
        </section>
      ) : null}

      {canAcademic ? (
        <section className="rounded-lg border border-ink/10 bg-white shadow-soft">
          <div className="border-b border-ink/10 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink"><RefreshCw className="h-4 w-4 text-moss" />Student Correction Inbox</p>
            <p className="mt-1 text-xs text-ink/55">Dedicated inbox for name, photo, date, program, level, and signature corrections.</p>
          </div>
          <div className="divide-y divide-ink/10">
            {corrections.map((request) => (
              <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_auto]" key={request.id}>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-ink">{certificateLabel(certificatesById.get(request.certificateId))}</p>
                    <Badge className={statusClass(request.status)}>{request.status.toLowerCase()}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink/55">{request.requesterName ?? request.requesterEmail ?? "Student"} requested {request.correctionType.toLowerCase()} correction on {formatDate(request.createdAt)}</p>
                  <p className="mt-2 text-xs leading-5 text-ink/65">{changeSummary(request.requestedChanges)}</p>
                  {request.reason ? <p className="mt-1 text-xs text-ink/50">Reason: {request.reason}</p> : null}
                </div>
                {request.status === "PENDING" ? (
                  <div className="flex items-center gap-2">
                    <Button className="h-8 px-3 text-xs" type="button" onClick={() => reviewCorrection(request.id, "APPROVE")}><BadgeCheck className="h-3.5 w-3.5" />Approve</Button>
                    <Button className="h-8 px-3 text-xs" type="button" variant="ghost" onClick={() => reviewCorrection(request.id, "REJECT")}>Reject</Button>
                  </div>
                ) : null}
              </div>
            ))}
            {corrections.length === 0 ? <p className="p-6 text-sm text-ink/55">No correction requests yet.</p> : null}
          </div>
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Printer className="h-4 w-4 text-moss" />Certificate Print & Collection Log</p>
          <form className="mt-4 space-y-3" onSubmit={createPrintLog}>
            <select className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" name="certificateId" required>
              <option value="">Select certificate</option>
              {certificates.map((certificate) => (
                <option key={certificate.id} value={certificate.id}>{certificateLabel(certificate)}</option>
              ))}
            </select>
            <select className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" name="status" defaultValue="READY_FOR_PRINT">
              <option value="READY_FOR_PRINT">Ready for print</option>
              <option value="PRINTED">Printed</option>
              <option value="COLLECTED">Collected</option>
              <option value="MAILED">Mailed</option>
              <option value="REPRINT_NEEDED">Reprint needed</option>
              <option value="DAMAGED">Damaged</option>
              <option value="UNCOLLECTED">Uncollected</option>
            </select>
            <div className="grid gap-2 md:grid-cols-2">
              <Input name="method" placeholder="Print / mail method" />
              <Input name="trackingCode" placeholder="Tracking code" />
            </div>
            <Input name="collectedBy" placeholder="Collected by" />
            <Textarea name="notes" placeholder="Notes" />
            <Button disabled={busy === "print-create"} type="submit"><Printer className="h-4 w-4" />Save log</Button>
          </form>
        </div>

        <div className="rounded-lg border border-ink/10 bg-white shadow-soft">
          <div className="divide-y divide-ink/10">
            {printLogs.map((log) => (
              <div className="p-4" key={log.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink">{certificateLabel(certificatesById.get(log.certificateId))}</p>
                    <p className="mt-1 text-xs text-ink/55">{log.method ?? "No method"} - {log.trackingCode ?? "No tracking"} - {formatDate(log.createdAt)}</p>
                  </div>
                  <Badge className={statusClass(log.status)}>{log.status.toLowerCase().replaceAll("_", " ")}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["PRINTED", "COLLECTED", "MAILED", "REPRINT_NEEDED", "DAMAGED", "UNCOLLECTED"].map((status) => (
                    <Button className="h-8 px-2 text-xs" key={status} type="button" variant="secondary" onClick={() => updatePrintLog(log.id, status)}>{status.toLowerCase().replaceAll("_", " ")}</Button>
                  ))}
                  <Button className="h-8 px-2 text-xs" type="button" variant="ghost" onClick={() => deletePrintLog(log.id)}><Trash2 className="h-3.5 w-3.5" />Delete</Button>
                </div>
              </div>
            ))}
            {printLogs.length === 0 ? <p className="p-6 text-sm text-ink/55">No print or collection log yet.</p> : null}
          </div>
        </div>
      </section>

      {canMinistryLicense ? (
        <section className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
          <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink"><ShieldCheck className="h-4 w-4 text-moss" />Ministry License System</p>
            <form className="mt-4 space-y-3" onSubmit={createLicense}>
              <select className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" name="userId">
                <option value="">External or non-user holder</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.name ?? user.email}</option>)}
              </select>
              <div className="grid gap-2 md:grid-cols-2">
                <Input name="holderName" placeholder="Holder name" required />
                <Input name="holderEmail" placeholder="Holder email" type="email" />
                <Input name="holderPhone" placeholder="Holder phone" />
                <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="licenseType" defaultValue="MINISTRY_LICENSE">
                  <option value="MINISTRY_LICENSE">Ministry license</option>
                  <option value="PREACHING_PERMIT">Preaching permit</option>
                  <option value="ORDINATION_CARD">Ordination card</option>
                  <option value="WORKER_PERMIT">Worker permit</option>
                  <option value="ACCESS_CREDENTIAL">Access credential</option>
                </select>
              </div>
              <Textarea name="scope" placeholder="Scope, restrictions, ministry authority, or permitted duties" />
              <div className="grid gap-2 md:grid-cols-3">
                <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="ministryId">
                  <option value="">No ministry</option>
                  {ministries.map((ministry) => <option key={ministry.id} value={ministry.id}>{ministry.name}</option>)}
                </select>
                <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="workspaceId">
                  <option value="">No workspace</option>
                  {workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
                </select>
                <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="organizationUnitId">
                  <option value="">No unit</option>
                  {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name} - {unit.type.toLowerCase()}</option>)}
                </select>
              </div>
              <Input name="expiresAt" type="date" />
              <Textarea name="renewalNote" placeholder="Issue note" />
              <Button disabled={busy === "license-create"} type="submit"><ShieldCheck className="h-4 w-4" />Issue license</Button>
            </form>
          </div>

          <div className="rounded-lg border border-ink/10 bg-white shadow-soft">
            <div className="divide-y divide-ink/10">
              {ministryLicenses.map((license) => (
                <div className="p-4" key={license.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-ink">{license.holderName}</p>
                      <p className="mt-1 text-xs text-ink/55">{license.licenseNumber} - {license.licenseType.toLowerCase().replaceAll("_", " ")} - expires {formatDate(license.expiresAt)}</p>
                    </div>
                    <Badge className={statusClass(license.status)}>{license.status.toLowerCase()}</Badge>
                  </div>
                  {license.scope ? <p className="mt-2 text-xs text-ink/60">{license.scope}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button className="h-8 px-2 text-xs" type="button" onClick={() => licenseAction(license.id, "RENEW")}>Renew</Button>
                    <Button className="h-8 px-2 text-xs" type="button" variant="secondary" onClick={() => licenseAction(license.id, "RESTORE")}>Restore</Button>
                    <Button className="h-8 px-2 text-xs" type="button" variant="ghost" onClick={() => licenseAction(license.id, "REVOKE")}>Revoke</Button>
                    <Button className="h-8 px-2 text-xs" type="button" variant="ghost" onClick={() => licenseAction(license.id, "EXPIRE")}>Expire</Button>
                    <Button className="h-8 px-2 text-xs" type="button" variant="ghost" onClick={() => licenseAction(license.id, "DELETE")}><Trash2 className="h-3.5 w-3.5" />Delete</Button>
                  </div>
                </div>
              ))}
              {ministryLicenses.length === 0 ? <p className="p-6 text-sm text-ink/55">No ministry licenses issued yet.</p> : null}
            </div>
          </div>
        </section>
      ) : null}

      {canAcademic ? (
        <section className="rounded-lg border border-ink/10 bg-white shadow-soft">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 p-4">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink"><ShieldAlert className="h-4 w-4 text-moss" />AI Academic Auditor</p>
              <p className="mt-1 text-xs text-ink/55">Checks missing photos, duplicate candidates, date conflicts, name mismatches, incomplete courses, and missing board approval.</p>
            </div>
            <Button disabled={busy === "audit-run"} type="button" onClick={runAudit}>
              {busy === "audit-run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpenCheck className="h-4 w-4" />}
              Run audit
            </Button>
          </div>
          <div className="grid gap-5 p-4 xl:grid-cols-[18rem_1fr]">
            <div className="space-y-2">
              {auditRuns.map((run) => (
                <div className="rounded-md border border-ink/10 bg-paper p-3 text-xs" key={run.id}>
                  <p className="font-semibold text-ink">{run.title}</p>
                  <p className="mt-1 text-ink/55">{run.summary ?? "Completed"} - {formatDate(run.createdAt)}</p>
                </div>
              ))}
              {auditRuns.length === 0 ? <p className="rounded-md bg-paper p-3 text-sm text-ink/55">No audit runs yet.</p> : null}
            </div>
            <div className="divide-y divide-ink/10 rounded-md border border-ink/10">
              {auditFindings.map((finding) => (
                <div className="p-3" key={finding.id}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-ink">{finding.title}</p>
                      <p className="mt-1 text-xs text-ink/60">{finding.detail}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge className={finding.severity === "CRITICAL" || finding.severity === "HIGH" ? "bg-clay/10 text-clay" : "bg-[#fff6d8] text-[#7c5d00]"}>{finding.severity.toLowerCase()}</Badge>
                      <Badge className={statusClass(finding.status)}>{finding.status.toLowerCase()}</Badge>
                    </div>
                  </div>
                  {finding.status === "OPEN" ? (
                    <Button className="mt-3 h-8 px-3 text-xs" type="button" variant="secondary" onClick={() => resolveFinding(finding.id)}>
                      Mark resolved
                    </Button>
                  ) : null}
                </div>
              ))}
              {auditFindings.length === 0 ? <p className="p-6 text-sm text-ink/55">No audit findings yet. Run an audit to check academic data quality.</p> : null}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
