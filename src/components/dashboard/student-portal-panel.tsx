"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Award, BadgeCheck, BookOpenCheck, Camera, ClipboardCheck, ExternalLink, Loader2, Printer, QrCode, RotateCcw, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type StudentCandidate = {
  id: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  photoUrl?: string | null;
  organization?: string | null;
  programName: string;
  educationLevel: string;
  fieldOfStudy: string;
  studyMode?: string | null;
  admissionDate?: string | Date | null;
  graduationDate?: string | Date | null;
  studentIdNumber?: string | null;
  studentIdIssuedAt?: string | Date | null;
  studentIdExpiresAt?: string | Date | null;
  studentIdStatus?: string | null;
  status: string;
  paymentStatus: string;
  feesCleared: boolean;
  coursesCompleted: boolean;
  rectorApproved: boolean;
  photoUploaded: boolean;
  nameVerified: boolean;
  clearanceStatus: string;
  clearanceNotes?: string | null;
};

type StudentCourse = {
  id: string;
  candidateId: string;
  courseCode?: string | null;
  courseTitle: string;
  credits?: number | null;
  grade?: string | null;
  status: string;
  completedAt?: string | Date | null;
};

type StudentCertificate = {
  id: string;
  userId?: string | null;
  academicCandidateId?: string | null;
  title: string;
  certificateNumber?: string | null;
  certificateCategory?: string | null;
  recipientName?: string | null;
  recipientEmail?: string | null;
  recipientPhotoUrl?: string | null;
  educationLevel?: string | null;
  programName?: string | null;
  fieldOfStudy?: string | null;
  completionDate?: string | Date | null;
  replacementOfId?: string | null;
  replacedById?: string | null;
  verifyToken: string;
  status: string;
  issuedAt: string | Date;
  expiresAt?: string | Date | null;
};

type StudentCorrection = {
  id: string;
  certificateId: string;
  academicCandidateId?: string | null;
  correctionType: string;
  requestedChanges: Record<string, unknown>;
  reason?: string | null;
  status: string;
  reviewNote?: string | null;
  replacementCertificateId?: string | null;
  createdAt: string | Date;
  reviewedAt?: string | Date | null;
};

function formatDate(value?: string | Date | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function formatDateInput(value?: string | Date | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function statusClass(status: string) {
  const normalized = status.toUpperCase();
  if (["ACTIVE", "CLEARED", "APPROVED"].includes(normalized)) return "bg-mint text-moss";
  if (["PENDING", "DRAFT", "REPLACED"].includes(normalized)) return "bg-[#fff6d8] text-[#7c5d00]";
  return "bg-clay/10 text-clay";
}

function studentIdStatus(candidate: StudentCandidate) {
  if (!candidate.studentIdNumber) return "PENDING";
  if (candidate.studentIdStatus && candidate.studentIdStatus !== "ACTIVE") return candidate.studentIdStatus;
  if (candidate.studentIdExpiresAt && new Date(candidate.studentIdExpiresAt) <= new Date()) return "EXPIRED";
  return "ACTIVE";
}

function StudentIdCard({ candidate }: { candidate: StudentCandidate }) {
  const status = studentIdStatus(candidate);
  const schoolName = candidate.organization?.trim() || "LETW School of Theology";

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-[#d4af37]/45 bg-white shadow-soft">
      <div className="relative overflow-hidden bg-[#0b1b3d] px-5 py-4 text-white">
        <div className="absolute -right-10 -top-16 h-36 w-36 rounded-full border border-[#d4af37]/25" />
        <div className="absolute -bottom-12 left-10 h-28 w-28 rounded-full border border-white/10" />
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white p-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="LETW logo" className="h-full w-full object-contain" src="/letw-logo.png" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#d4af37]">Light Encounter Tabernacle Worldwide</p>
              <p className="mt-1 text-lg font-semibold leading-tight">Official Student Identity</p>
              <p className="mt-1 text-xs text-white/70">{schoolName}</p>
            </div>
          </div>
          <Badge className={statusClass(status)}>{status.toLowerCase()}</Badge>
        </div>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[11rem_minmax(0,1fr)_10.5rem]">
        <div className="space-y-3">
          <div className="flex aspect-[3/3.4] items-center justify-center overflow-hidden rounded-xl border-2 border-[#d4af37]/55 bg-paper">
            {candidate.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt={candidate.fullName} className="h-full w-full object-cover" src={candidate.photoUrl} />
            ) : (
              <div className="text-center text-xs text-ink/45">
                <Camera className="mx-auto h-7 w-7" />
                <span className="mt-2 block">Photo pending</span>
              </div>
            )}
          </div>
          <div className="rounded-lg bg-mint px-3 py-2 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-moss">Student status</p>
            <p className="mt-1 text-sm font-semibold text-moss">{status}</p>
          </div>
        </div>

        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d4af37]">Student / Candidate</p>
          <h3 className="mt-1 break-words text-2xl font-semibold leading-tight text-[#0b1b3d]">{candidate.fullName}</h3>
          <p className="mt-2 text-sm font-medium text-ink/70">{candidate.educationLevel} - {candidate.programName}</p>
          <p className="mt-1 text-xs text-ink/50">{candidate.fieldOfStudy || "Theology"}{candidate.studyMode ? ` - ${candidate.studyMode}` : ""}</p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[#0b1b3d]/10 bg-[#f8fbff] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/45">Student ID number</p>
              <p className="mt-1 break-all font-mono text-sm font-semibold text-[#0b1b3d]">{candidate.studentIdNumber ?? "Pending issue"}</p>
            </div>
            <div className="rounded-lg border border-[#0b1b3d]/10 bg-[#f8fbff] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/45">Program</p>
              <p className="mt-1 text-sm font-semibold text-[#0b1b3d]">{candidate.programName}</p>
            </div>
            <div className="rounded-lg border border-[#0b1b3d]/10 bg-[#f8fbff] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/45">Issued</p>
              <p className="mt-1 text-sm font-semibold text-[#0b1b3d]">{formatDate(candidate.studentIdIssuedAt)}</p>
            </div>
            <div className="rounded-lg border border-[#0b1b3d]/10 bg-[#f8fbff] p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/45">Expires</p>
              <p className="mt-1 text-sm font-semibold text-[#0b1b3d]">{formatDate(candidate.studentIdExpiresAt)}</p>
            </div>
          </div>

          <div className="mt-4 rounded-lg border border-[#d4af37]/35 bg-[#fffaf0] px-3 py-2 text-xs leading-5 text-ink/65">
            This Student ID is issued at admission and remains valid only when the live LETW verification page confirms an active status.
          </div>
        </div>

        <div className="flex flex-col items-center justify-center rounded-xl border border-[#d4af37]/45 bg-[#f8fbff] p-3 text-center">
          {candidate.studentIdNumber ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img alt="Student ID QR code" className="h-32 w-32 rounded-md bg-white p-1" src={`/api/academic-candidates/${candidate.id}/student-id-qr`} />
          ) : (
            <div className="flex h-32 w-32 items-center justify-center rounded-md border border-dashed border-ink/20 bg-white text-ink/35">
              <QrCode className="h-10 w-10" />
            </div>
          )}
          <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#0b1b3d]">Scan to verify</p>
          <p className="mt-1 break-all font-mono text-[10px] text-ink/45">{candidate.studentIdNumber ?? "Admission ID pending"}</p>
          <div className="mt-3 flex items-center gap-1 rounded-full bg-white px-2 py-1 text-[10px] font-semibold text-moss">
            <ShieldCheck className="h-3 w-3" />
            Live register
          </div>
          {candidate.studentIdNumber ? (
            <div className="mt-3 grid w-full gap-2">
              <a
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded-md border border-[#0b1b3d]/10 bg-white px-3 text-xs font-semibold text-[#0b1b3d] hover:bg-mint/40"
                href={`/api/academic-candidates/${candidate.id}/student-id-pdf`}
                rel="noreferrer"
                target="_blank"
              >
                <Printer className="h-3.5 w-3.5" />
                Print PDF
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function valueFromForm(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
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
    secondSignatoryName: "Signatory",
    secondSignatoryTitle: "Signatory title",
    secondSignatorySignatureUrl: "Signature image",
    signatureNote: "Signature note"
  };
  const parts = Object.entries(changes)
    .filter(([, value]) => typeof value === "string" && value.trim())
    .map(([key, value]) => `${labels[key] ?? key}: ${String(value)}`);
  return parts.length ? parts.join(" | ") : "No details recorded";
}

export function StudentPortalPanel({
  candidates,
  courses,
  certificates,
  correctionRequests
}: {
  candidates: StudentCandidate[];
  courses: StudentCourse[];
  certificates: StudentCertificate[];
  correctionRequests: StudentCorrection[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const pendingCorrections = correctionRequests.filter((request) => request.status === "PENDING");
  const clearedCandidates = candidates.filter((candidate) => candidate.clearanceStatus === "CLEARED").length;
  const activeCertificates = certificates.filter((certificate) => certificate.status === "ACTIVE").length;

  const coursesByCandidate = useMemo(() => {
    const map = new Map<string, StudentCourse[]>();
    courses.forEach((course) => {
      map.set(course.candidateId, [...(map.get(course.candidateId) ?? []), course]);
    });
    return map;
  }, [courses]);

  const correctionsByCertificate = useMemo(() => {
    const map = new Map<string, StudentCorrection[]>();
    correctionRequests.forEach((request) => {
      map.set(request.certificateId, [...(map.get(request.certificateId) ?? []), request]);
    });
    return map;
  }, [correctionRequests]);

  async function uploadCorrectionPhoto(file: FormDataEntryValue | null) {
    if (!(file instanceof File) || file.size <= 0) return undefined;
    const formData = new FormData();
    formData.append("kind", "correction-photo");
    formData.append("file", file);
    const response = await fetch("/api/certificates/assets", { method: "POST", body: formData });
    const body = (await response.json().catch(() => null)) as { imageUrl?: string; error?: string } | null;
    if (!response.ok || !body?.imageUrl) throw new Error(body?.error ?? "Correction photo upload failed.");
    return body.imageUrl;
  }

  async function requestCorrection(event: FormEvent<HTMLFormElement>, certificateId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setBusy(`correction-${certificateId}`);
    setNotice("");
    setError("");

    try {
      const recipientPhotoUrl = await uploadCorrectionPhoto(formData.get("recipientPhotoFile"));
      const completionDate = valueFromForm(formData, "completionDate");
      const requestedChanges = {
        recipientName: valueFromForm(formData, "recipientName") || undefined,
        completionDate: completionDate ? new Date(completionDate).toISOString() : undefined,
        recipientPhotoUrl,
        educationLevel: valueFromForm(formData, "educationLevel") || undefined,
        programName: valueFromForm(formData, "programName") || undefined,
        fieldOfStudy: valueFromForm(formData, "fieldOfStudy") || undefined,
        gradeOrHonors: valueFromForm(formData, "gradeOrHonors") || undefined,
        signatureNote: valueFromForm(formData, "signatureNote") || undefined
      };
      const response = await fetch("/api/certificates/corrections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          certificateId,
          correctionType: valueFromForm(formData, "correctionType") || "OTHER",
          requestedChanges,
          reason: valueFromForm(formData, "reason") || null
        })
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setBusy("");

      if (!response.ok) {
        setError(body?.error ?? "Correction request could not be sent.");
        return;
      }

      form.reset();
      setNotice("Correction request sent. A rector or approved certificate issuer will review it.");
      router.refresh();
    } catch (uploadError) {
      setBusy("");
      setError(uploadError instanceof Error ? uploadError.message : "Correction request could not be sent.");
    }
  }

  return (
    <div className="space-y-6">
      {notice ? <p className="rounded-md border border-moss/15 bg-mint px-4 py-3 text-sm text-moss">{notice}</p> : null}
      {error ? <p className="rounded-md bg-clay/10 px-4 py-3 text-sm text-clay">{error}</p> : null}

      <section className="grid gap-4 md:grid-cols-4">
        {[
          ["Student records", candidates.length],
          ["Cleared programs", clearedCandidates],
          ["Issued certificates", activeCertificates],
          ["Pending corrections", pendingCorrections.length]
        ].map(([label, value]) => (
          <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft" key={String(label)}>
            <p className="text-2xl font-semibold text-ink">{value}</p>
            <p className="mt-1 text-sm text-ink/55">{label}</p>
          </div>
        ))}
      </section>

      {candidates.length === 0 && certificates.length === 0 ? (
        <section className="rounded-lg border border-ink/10 bg-white p-8 text-center shadow-soft">
          <Award className="mx-auto h-8 w-8 text-moss" />
          <h2 className="mt-3 text-xl font-semibold text-ink">No student record is linked to this login yet.</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-ink/60">
            Ask the rector or certificate office to create your admission record or connect your invited LETW account email to your existing student record.
          </p>
        </section>
      ) : null}

      {candidates.map((candidate) => {
        const candidateCourses = coursesByCandidate.get(candidate.id) ?? [];
        const checklist = [
          ["Fees cleared", candidate.feesCleared],
          ["Courses completed", candidate.coursesCompleted],
          ["Rector approved", candidate.rectorApproved],
          ["Photo uploaded", candidate.photoUploaded],
          ["Name verified", candidate.nameVerified]
        ];

        return (
          <section className="rounded-lg border border-ink/10 bg-white shadow-soft" key={candidate.id}>
            <div className="flex flex-col gap-4 border-b border-ink/10 p-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex gap-4">
                <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-md border border-ink/10 bg-paper">
                  {candidate.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt={candidate.fullName} className="h-full w-full object-cover" src={candidate.photoUrl} />
                  ) : (
                    <Camera className="h-6 w-6 text-ink/35" />
                  )}
                </div>
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium text-moss">
                    <BookOpenCheck className="h-4 w-4" />
                    Student academic record
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold text-ink">{candidate.fullName}</h2>
                  <p className="mt-1 text-sm text-ink/60">{candidate.educationLevel} - {candidate.programName}</p>
                  <p className="mt-1 text-xs text-ink/45">
                    Admitted {formatDate(candidate.admissionDate)} - Expected completion {formatDate(candidate.graduationDate)}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge className={statusClass(candidate.status)}>{candidate.status.toLowerCase()}</Badge>
                <Badge className={statusClass(candidate.clearanceStatus)}>{candidate.clearanceStatus.toLowerCase()}</Badge>
                <Badge className={statusClass(candidate.paymentStatus)}>{candidate.paymentStatus.toLowerCase()}</Badge>
              </div>
            </div>

            <div className="grid gap-5 p-5 lg:grid-cols-[0.9fr_1.1fr]">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <ClipboardCheck className="h-4 w-4 text-moss" />
                  Clearance checklist
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {checklist.map(([label, done]) => (
                    <div className="flex items-center justify-between rounded-md border border-ink/10 bg-paper px-3 py-2 text-sm" key={String(label)}>
                      <span>{label}</span>
                      <Badge className={done ? "bg-mint text-moss" : "bg-[#fff6d8] text-[#7c5d00]"}>{done ? "done" : "pending"}</Badge>
                    </div>
                  ))}
                </div>
                {candidate.clearanceNotes ? <p className="mt-3 rounded-md bg-paper px-3 py-2 text-xs text-ink/60">{candidate.clearanceNotes}</p> : null}
              </div>

              <div>
                <StudentIdCard candidate={candidate} />
                <p className="text-sm font-semibold text-ink">Completed course history</p>
                <div className="mt-3 divide-y divide-ink/10 rounded-md border border-ink/10">
                  {candidateCourses.map((course) => (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm" key={course.id}>
                      <div>
                        <p className="font-medium text-ink">{course.courseCode ? `${course.courseCode} - ` : ""}{course.courseTitle}</p>
                        <p className="text-xs text-ink/50">{course.status.toLowerCase()} - {formatDate(course.completedAt)}</p>
                      </div>
                      <Badge>{course.grade ?? "no grade"}</Badge>
                    </div>
                  ))}
                  {candidateCourses.length === 0 ? <p className="px-3 py-5 text-sm text-ink/55">No completed courses recorded yet.</p> : null}
                </div>
              </div>
            </div>
          </section>
        );
      })}

      <section className="rounded-lg border border-ink/10 bg-white shadow-soft">
        <div className="border-b border-ink/10 p-5">
          <p className="flex items-center gap-2 text-sm font-medium text-moss">
            <BadgeCheck className="h-4 w-4" />
            Issued certificates and correction workflow
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-ink">Your academic certificates</h2>
          <p className="mt-1 text-sm text-ink/55">Request correction for name, date, photo, level, program, field, grade, or signature details.</p>
        </div>
        <div className="divide-y divide-ink/10">
          {certificates.map((certificate) => {
            const requests = correctionsByCertificate.get(certificate.id) ?? [];
            return (
              <div className="grid gap-4 p-5 xl:grid-cols-[minmax(0,1fr)_24rem]" key={certificate.id}>
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-ink">{certificate.title}</p>
                      <p className="mt-1 text-sm text-ink/55">{certificate.certificateNumber ?? "Certificate number pending"}</p>
                      <p className="mt-1 text-xs text-ink/45">
                        Issued {formatDate(certificate.issuedAt)} - Completed {formatDate(certificate.completionDate)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge className={statusClass(certificate.status)}>{certificate.status.toLowerCase()}</Badge>
                      {certificate.replacementOfId ? <Badge>replacement</Badge> : null}
                      {certificate.replacedById ? <Badge className="bg-[#fff6d8] text-[#7c5d00]">has newer certificate</Badge> : null}
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-ink/65 sm:grid-cols-2">
                    <p>Holder: <span className="font-medium text-ink">{certificate.recipientName ?? "Not set"}</span></p>
                    <p>Program: <span className="font-medium text-ink">{certificate.programName ?? "Not set"}</span></p>
                    <p>Level: <span className="font-medium text-ink">{certificate.educationLevel ?? "Not set"}</span></p>
                    <p>Field: <span className="font-medium text-ink">{certificate.fieldOfStudy ?? "Not set"}</span></p>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <a className="inline-flex h-9 items-center gap-2 rounded-md border border-ink/10 bg-paper px-3 text-sm font-medium hover:bg-mint/40" href={`/api/certificates/${certificate.id}/pdf`}>
                      <Award className="h-4 w-4" />
                      Open PDF
                    </a>
                    <a className="inline-flex h-9 items-center gap-2 rounded-md border border-ink/10 bg-paper px-3 text-sm font-medium hover:bg-mint/40" href={`/verify/certificate/${certificate.verifyToken}`}>
                      <ExternalLink className="h-4 w-4" />
                      Verify
                    </a>
                  </div>
                  {requests.length ? (
                    <div className="mt-4 space-y-2">
                      {requests.map((request) => (
                        <div className="rounded-md border border-ink/10 bg-paper px-3 py-2 text-xs text-ink/60" key={request.id}>
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold text-ink">{request.correctionType.toLowerCase()} correction</p>
                            <Badge className={statusClass(request.status)}>{request.status.toLowerCase()}</Badge>
                          </div>
                          <p className="mt-1">{changeSummary(request.requestedChanges)}</p>
                          {request.reviewNote ? <p className="mt-1 text-ink/50">Review note: {request.reviewNote}</p> : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <form className="rounded-lg border border-ink/10 bg-paper p-4" onSubmit={(event) => requestCorrection(event, certificate.id)}>
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <RotateCcw className="h-4 w-4 text-moss" />
                    Request correction
                  </p>
                  <div className="mt-3 space-y-2">
                    <select className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" name="correctionType" defaultValue="NAME">
                      <option value="NAME">Name correction</option>
                      <option value="DATE">Date correction</option>
                      <option value="PHOTO">Photo correction</option>
                      <option value="LEVEL">Level correction</option>
                      <option value="PROGRAM">Program correction</option>
                      <option value="SIGNATURE">Signature correction</option>
                      <option value="OTHER">Other correction</option>
                    </select>
                    <Input name="recipientName" placeholder="Correct holder name" defaultValue={certificate.recipientName ?? ""} />
                    <Input name="completionDate" type="date" defaultValue={formatDateInput(certificate.completionDate)} />
                    <Input name="educationLevel" placeholder="Correct level" defaultValue={certificate.educationLevel ?? ""} />
                    <Input name="programName" placeholder="Correct program" defaultValue={certificate.programName ?? ""} />
                    <Input name="fieldOfStudy" placeholder="Correct field" defaultValue={certificate.fieldOfStudy ?? ""} />
                    <Input name="gradeOrHonors" placeholder="Correct grade / honors" />
                    <label className="flex min-h-10 flex-col justify-center rounded-md border border-ink/10 bg-white px-3 py-2 text-xs text-ink/55">
                      Corrected photo if needed
                      <input accept="image/png,image/jpeg,image/webp" className="mt-1 text-xs" name="recipientPhotoFile" type="file" />
                    </label>
                    <Textarea name="signatureNote" placeholder="Explain signature correction if needed" />
                    <Textarea name="reason" placeholder="Reason for correction" />
                    <Button className="w-full" disabled={busy === `correction-${certificate.id}`} type="submit">
                      {busy === `correction-${certificate.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                      Send correction request
                    </Button>
                  </div>
                </form>
              </div>
            );
          })}
          {certificates.length === 0 ? <p className="px-5 py-10 text-sm text-ink/55">No academic certificate has been issued to this student record yet.</p> : null}
        </div>
      </section>
    </div>
  );
}
