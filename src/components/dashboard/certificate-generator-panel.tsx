"use client";

import { FormEvent, PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Award, BadgeCheck, Download, ExternalLink, Loader2, PenLine, Printer, QrCode, RotateCcw, ShieldCheck, ShieldOff, Stamp, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  CERTIFICATE_PRESET_OPTIONS,
  MARRIAGE_CERTIFICATE_TYPES,
  MINISTRY_CERTIFICATE_TYPES,
  THEOLOGY_CERTIFICATE_TYPES,
  certificatePresetDefaults,
  type CertificatePreset
} from "@/lib/certificate-presets";
import { certificateIsLive, certificatePublicStatus } from "@/lib/certificates";

type CertificateUser = {
  id: string | null;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  memberProfile?: {
    membershipNumber?: string | null;
    organizationPosition?: string | null;
    phone?: string | null;
  } | null;
};

type CertificateRow = {
  id: string;
  userId: string | null;
  academicCandidateId?: string | null;
  title: string;
  issuer: string;
  certificateNumber?: string | null;
  certificateCategory?: string | null;
  recipientName?: string | null;
  recipientEmail?: string | null;
  recipientPhotoUrl?: string | null;
  educationLevel?: string | null;
  programName?: string | null;
  fieldOfStudy?: string | null;
  gradeOrHonors?: string | null;
  studyMode?: string | null;
  studyStartDate?: string | Date | null;
  studyEndDate?: string | Date | null;
  completionDate?: string | Date | null;
  customBody?: string | null;
  certificatePreset?: string | null;
  templateStyle?: string | null;
  templateAccent?: string | null;
  sealStyle?: string | null;
  signatureLayout?: string | null;
  watermarkStrength?: string | null;
  presidentSignatureUrl?: string | null;
  secondSignatoryName?: string | null;
  secondSignatoryTitle?: string | null;
  secondSignatorySignatureUrl?: string | null;
  spouseOneName?: string | null;
  spouseTwoName?: string | null;
  marriageDate?: string | Date | null;
  marriageLocation?: string | null;
  officiantName?: string | null;
  witnessOneName?: string | null;
  witnessTwoName?: string | null;
  replacementOfId?: string | null;
  replacedById?: string | null;
  sealNumber?: string | null;
  credentialHash?: string | null;
  verifyToken: string;
  status: string;
  issuedAt: string | Date;
  expiresAt?: string | Date | null;
  revokedAt?: string | Date | null;
  user: CertificateUser;
};

type AcademicCandidateRow = {
  id: string;
  userId?: string | null;
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
  status: string;
  paymentStatus: string;
  feesCleared: boolean;
  coursesCompleted: boolean;
  rectorApproved: boolean;
  photoUploaded: boolean;
  nameVerified: boolean;
  clearanceStatus: string;
  clearanceNotes?: string | null;
  certificates?: Array<{ id: string; title: string; certificateNumber?: string | null; status: string; issuedAt: string | Date }>;
  courses?: Array<{ id: string; courseCode?: string | null; courseTitle: string; grade?: string | null; status: string }>;
};

type SignatureProfileRow = {
  id: string;
  name: string;
  title: string;
  role: string;
  imageUrl: string;
  active: boolean;
};

type CertificateBatchJobRow = {
  id: string;
  title: string;
  status: string;
  totalRows: number;
  issuedCount: number;
  failedCount: number;
  createdAt: string | Date;
};

type CertificateCorrectionRequestRow = {
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
  reviewedAt?: string | Date | null;
  certificate?: {
    id: string;
    title: string;
    certificateNumber?: string | null;
    status: string;
    recipientName?: string | null;
    recipientEmail?: string | null;
  } | null;
  candidate?: {
    id: string;
    fullName: string;
    email?: string | null;
    educationLevel: string;
    programName: string;
  } | null;
};

function displayName(user: CertificateUser) {
  return user.name ?? user.email ?? "LETW Member";
}

function initials(user: CertificateUser) {
  const source = displayName(user);
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "L";
}

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "No expiry";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function academicCandidateReady(candidate: AcademicCandidateRow) {
  return candidate.feesCleared && candidate.coursesCompleted && candidate.rectorApproved && candidate.photoUploaded && candidate.nameVerified;
}

function defaultPresetForCategory(category: "MINISTRY" | "EDUCATION" | "MARRIAGE") {
  if (category === "EDUCATION") return "THEOLOGY_DEGREE";
  if (category === "MARRIAGE") return "MARRIAGE_COVENANT";
  return "MEMBERSHIP_COVENANT";
}

function correctionChangeSummary(changes: Record<string, unknown>) {
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
  return parts.length ? parts.join(" | ") : "No correction details recorded.";
}

function SignaturePad({ label, name, resetKey }: { label: string; name: string; resetKey: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const [dataUrl, setDataUrl] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setDataUrl("");
  }, [resetKey]);

  function pointFromEvent(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function beginSignature(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    lastPointRef.current = pointFromEvent(event);
  }

  function drawSignature(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || !lastPointRef.current) return;
    const canvas = event.currentTarget;
    const context = canvas.getContext("2d");
    if (!context) return;
    const nextPoint = pointFromEvent(event);
    context.strokeStyle = "#061a3a";
    context.lineWidth = 5.8;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(lastPointRef.current.x, lastPointRef.current.y);
    context.lineTo(nextPoint.x, nextPoint.y);
    context.stroke();
    lastPointRef.current = nextPoint;
  }

  function endSignature(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    lastPointRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setDataUrl(event.currentTarget.toDataURL("image/png"));
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setDataUrl("");
  }

  return (
    <div className="rounded-md border border-ink/10 bg-white p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink">{label}</span>
        <Button className="h-8 px-3 text-xs" type="button" variant="ghost" onClick={clearSignature}>
          Clear
        </Button>
      </div>
      <input name={name} type="hidden" value={dataUrl} />
      <canvas
        ref={canvasRef}
        className="h-32 w-full touch-none rounded-md border border-dashed border-[#0b1b3d]/25 bg-[#fbfdff]"
        height={190}
        width={760}
        onPointerCancel={endSignature}
        onPointerDown={beginSignature}
        onPointerLeave={endSignature}
        onPointerMove={drawSignature}
        onPointerUp={endSignature}
      />
    </div>
  );
}

export function CertificateGeneratorPanel({
  users,
  certificates,
  canManage,
  academicOnly = false,
  academicCandidates = [],
  signatureProfiles = [],
  batchJobs = [],
  correctionRequests = []
}: {
  users: CertificateUser[];
  certificates: CertificateRow[];
  canManage: boolean;
  academicOnly?: boolean;
  academicCandidates?: AcademicCandidateRow[];
  signatureProfiles?: SignatureProfileRow[];
  batchJobs?: CertificateBatchJobRow[];
  correctionRequests?: CertificateCorrectionRequestRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [certificateCategory, setCertificateCategory] = useState<"MINISTRY" | "EDUCATION" | "MARRIAGE">(academicOnly ? "EDUCATION" : "MINISTRY");
  const [certificatePreset, setCertificatePreset] = useState<CertificatePreset>(academicOnly ? "THEOLOGY_DEGREE" : "MEMBERSHIP_COVENANT");
  const [signatureResetKey, setSignatureResetKey] = useState(0);
  const activePresetDefaults = certificatePresetDefaults(certificatePreset);

  const filteredCertificates = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return certificates;

    return certificates.filter((certificate) =>
      [
        certificate.title,
        certificate.certificateNumber,
        certificate.status,
        certificate.user.name,
        certificate.user.email,
        certificate.recipientName,
        certificate.recipientEmail,
        certificate.educationLevel,
        certificate.programName,
        certificate.fieldOfStudy,
        certificate.gradeOrHonors,
        certificate.spouseOneName,
        certificate.spouseTwoName,
        certificate.marriageLocation,
        certificate.officiantName,
        certificate.secondSignatoryName,
        certificate.secondSignatoryTitle,
        certificate.sealNumber,
        certificate.credentialHash,
        certificate.user.memberProfile?.membershipNumber,
        certificate.user.memberProfile?.organizationPosition
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(value)
    );
  }, [certificates, query]);

  useEffect(() => {
    document.body.classList.add("letw-certificate-page");

    function ensureCertificatePrintPage() {
      if (document.getElementById("letw-certificate-print-page-style")) return;
      const style = document.createElement("style");
      style.id = "letw-certificate-print-page-style";
      style.textContent = `
        @media print {
          @page { size: letter landscape; margin: 0; }
          html, body.letw-certificate-page {
            width: 279.4mm !important;
            min-width: 279.4mm !important;
            height: 215.9mm !important;
            min-height: 215.9mm !important;
          }
        }
      `;
      document.head.appendChild(style);
    }

    function removeCertificatePrintPage() {
      document.getElementById("letw-certificate-print-page-style")?.remove();
    }

    window.addEventListener("beforeprint", ensureCertificatePrintPage);
    window.addEventListener("afterprint", removeCertificatePrintPage);

    return () => {
      document.body.classList.remove("letw-certificate-page");
      window.removeEventListener("beforeprint", ensureCertificatePrintPage);
      window.removeEventListener("afterprint", removeCertificatePrintPage);
      removeCertificatePrintPage();
    };
  }, []);

  function printCertificates() {
    const style = document.createElement("style");
    style.id = "letw-certificate-print-page-style";
    style.textContent = `
      @media print {
        @page { size: letter landscape; margin: 0; }
        html, body.letw-certificate-page {
          width: 279.4mm !important;
          min-width: 279.4mm !important;
          height: 215.9mm !important;
          min-height: 215.9mm !important;
        }
      }
    `;
    document.getElementById("letw-certificate-print-page-style")?.remove();
    document.head.appendChild(style);
    window.print();
  }

  function formText(formData: FormData, name: string) {
    const value = formData.get(name);
    return typeof value === "string" ? value.trim() : "";
  }

  async function uploadCertificateAsset(file: FormDataEntryValue | null, kind: string) {
    if (!(file instanceof File) || file.size <= 0) return undefined;
    const uploadForm = new FormData();
    uploadForm.append("kind", kind);
    uploadForm.append("file", file);
    const response = await fetch("/api/certificates/assets", {
      method: "POST",
      body: uploadForm
    });
    const body = (await response.json().catch(() => null)) as { imageUrl?: string; error?: string } | null;
    if (!response.ok || !body?.imageUrl) {
      throw new Error(body?.error ?? "Certificate image upload failed.");
    }
    return body.imageUrl;
  }

  async function uploadCertificateSignatureData(dataUrl: string, kind: string) {
    if (!dataUrl.startsWith("data:image/png;base64,")) return undefined;
    const response = await fetch(dataUrl);
    const blob = await response.blob();
    if (blob.size <= 0) return undefined;
    return uploadCertificateAsset(new File([blob], `${kind}.png`, { type: "image/png" }), kind);
  }

  async function createCertificate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const intent = submitter?.value ?? "issue";
    setBusy("create");
    setNotice("");
    setError("");

    try {
      const selectedCategory = academicOnly ? "EDUCATION" : formText(formData, "certificateCategory");
      const recipientPhotoUrl = await uploadCertificateAsset(formData.get("recipientPhotoFile"), "recipient-photo");
      const presidentSignatureUrl = await uploadCertificateAsset(formData.get("presidentSignatureFile"), "president-signature");
      const secondSignatureKind = selectedCategory === "EDUCATION" ? "rector-signature" : "second-signature";
      const secondSignatorySignatureUrl =
        (await uploadCertificateSignatureData(formText(formData, "secondSignatorySignatureDrawn"), secondSignatureKind)) ??
        (await uploadCertificateAsset(formData.get("secondSignatorySignatureFile"), secondSignatureKind));
      const spouseOnePhotoUrl = await uploadCertificateAsset(formData.get("spouseOnePhotoFile"), "spouse-photo");
      const spouseTwoPhotoUrl = await uploadCertificateAsset(formData.get("spouseTwoPhotoFile"), "spouse-photo");

      const title = formText(formData, "customTitle") || formText(formData, "title");
      const response = await fetch("/api/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: formText(formData, "userId") || null,
          academicCandidateId: formText(formData, "academicCandidateId") || null,
          signatureProfileId: formText(formData, "signatureProfileId") || null,
          previewOnly: intent === "preview",
          title,
          certificateCategory: selectedCategory,
          recipientName: formText(formData, "recipientName") || undefined,
          recipientEmail: formText(formData, "recipientEmail") || undefined,
          recipientPhone: formText(formData, "recipientPhone") || undefined,
          recipientPhotoUrl,
          recipientOrganization: formText(formData, "recipientOrganization") || undefined,
          educationLevel: formText(formData, "educationLevel") || undefined,
          programName: formText(formData, "programName") || title,
          fieldOfStudy: formText(formData, "fieldOfStudy") || (selectedCategory === "EDUCATION" ? "Theology" : undefined),
          gradeOrHonors: formText(formData, "gradeOrHonors") || undefined,
          studyMode: formText(formData, "studyMode") || undefined,
          studyStartDate: formText(formData, "studyStartDate") ? new Date(formText(formData, "studyStartDate")).toISOString() : null,
          studyEndDate: formText(formData, "studyEndDate") ? new Date(formText(formData, "studyEndDate")).toISOString() : null,
          completionDate: formText(formData, "completionDate") ? new Date(formText(formData, "completionDate")).toISOString() : null,
          customBody: formText(formData, "customBody") || undefined,
          certificatePreset: academicOnly ? "THEOLOGY_DEGREE" : formText(formData, "certificatePreset") || certificatePreset,
          templateStyle: formText(formData, "templateStyle") || undefined,
          templateAccent: formText(formData, "templateAccent") || undefined,
          sealStyle: formText(formData, "sealStyle") || undefined,
          signatureLayout: formText(formData, "signatureLayout") || undefined,
          watermarkStrength: formText(formData, "watermarkStrength") || undefined,
          presidentSignatureUrl,
          secondSignatoryName: formText(formData, "secondSignatoryName") || undefined,
          secondSignatoryTitle: formText(formData, "secondSignatoryTitle") || undefined,
          secondSignatorySignatureUrl,
          spouseOneName: formText(formData, "spouseOneName") || undefined,
          spouseOneEmail: formText(formData, "spouseOneEmail") || undefined,
          spouseOnePhotoUrl,
          spouseTwoName: formText(formData, "spouseTwoName") || undefined,
          spouseTwoEmail: formText(formData, "spouseTwoEmail") || undefined,
          spouseTwoPhotoUrl,
          marriageDate: formText(formData, "marriageDate") ? new Date(formText(formData, "marriageDate")).toISOString() : null,
          marriageLocation: formText(formData, "marriageLocation") || undefined,
          officiantName: formText(formData, "officiantName") || undefined,
          witnessOneName: formText(formData, "witnessOneName") || undefined,
          witnessTwoName: formText(formData, "witnessTwoName") || undefined,
          certificateNumber: formText(formData, "certificateNumber") || undefined,
          expiresAt: formText(formData, "expiresAt") ? new Date(formText(formData, "expiresAt")).toISOString() : null
        })
      });
      const body = (await response.json().catch(() => null)) as { error?: string; pendingApproval?: { id: string } } | null;
      setBusy("");

      if (!response.ok) {
        setError(body?.error ?? "Certificate could not be created.");
        return;
      }

      form.reset();
      setSignatureResetKey((value) => value + 1);
      setNotice(body?.pendingApproval ? "Certificate request sent to the president for approval." : intent === "preview" ? "Preview draft created. Open its PDF, check it, then issue it when approved." : academicOnly ? "Academic certificate created." : "Certificate created.");
      router.refresh();
    } catch (uploadError) {
      setBusy("");
      setError(uploadError instanceof Error ? uploadError.message : "Certificate could not be created.");
      return;
    }
  }

  async function updateCertificate(id: string, action: "REVOKE" | "RESTORE" | "REISSUE" | "ISSUE") {
    const reason = action === "REISSUE" ? window.prompt("Why is this certificate being reissued or replaced?") : null;
    if (action === "REISSUE" && !reason?.trim()) return;
    setBusy(`${action}-${id}`);
    setNotice("");
    setError("");
    const response = await fetch(`/api/certificates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason })
    });
    const body = (await response.json().catch(() => null)) as { error?: string; pendingApproval?: { id: string } } | null;
    setBusy("");

    if (!response.ok) {
      setError(body?.error ?? "Certificate action failed.");
      return;
    }

    setNotice(body?.pendingApproval ? "Certificate action sent to the president for approval." : action === "REVOKE" ? "Certificate revoked." : action === "REISSUE" ? "Certificate reissued and old certificate replaced." : action === "ISSUE" ? "Preview approved and certificate issued." : "Certificate restored.");
    router.refresh();
  }

  async function deleteCertificate(id: string, title: string) {
    if (!window.confirm(`Delete "${title}" permanently? This cannot be undone.`)) return;
    setBusy(`DELETE-${id}`);
    setNotice("");
    setError("");
    const response = await fetch(`/api/certificates/${id}`, {
      method: "DELETE"
    });
    const body = (await response.json().catch(() => null)) as { error?: string; pendingApproval?: { id: string } } | null;
    setBusy("");

    if (!response.ok) {
      setError(body?.error ?? "Certificate could not be deleted.");
      return;
    }

    setNotice(body?.pendingApproval ? "Certificate deletion sent to the president for approval." : "Certificate deleted.");
    router.refresh();
  }

  async function createAcademicCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setBusy("candidate");
    setNotice("");
    setError("");
    try {
      const photoUrl = await uploadCertificateAsset(formData.get("photoFile"), "recipient-photo");
      const response = await fetch("/api/academic-candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: formText(formData, "fullName"),
          email: formText(formData, "email") || null,
          phone: formText(formData, "phone") || null,
          photoUrl,
          organization: formText(formData, "organization") || null,
          programName: formText(formData, "programName"),
          educationLevel: formText(formData, "educationLevel"),
          fieldOfStudy: formText(formData, "fieldOfStudy") || "Theology",
          studyMode: formText(formData, "studyMode") || null,
          admissionDate: formText(formData, "admissionDate") ? new Date(formText(formData, "admissionDate")).toISOString() : null,
          graduationDate: formText(formData, "graduationDate") ? new Date(formText(formData, "graduationDate")).toISOString() : null,
          paymentStatus: formData.get("feesCleared") === "on" ? "CLEARED" : "PENDING",
          feesCleared: formData.get("feesCleared") === "on",
          coursesCompleted: formData.get("coursesCompleted") === "on",
          rectorApproved: formData.get("rectorApproved") === "on",
          photoUploaded: Boolean(photoUrl) || formData.get("photoUploaded") === "on",
          nameVerified: formData.get("nameVerified") === "on",
          clearanceNotes: formText(formData, "clearanceNotes") || null
        })
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setBusy("");
      if (!response.ok) {
        setError(body?.error ?? "Academic candidate could not be created.");
        return;
      }
      form.reset();
      setNotice("Academic candidate added to the student registry.");
      router.refresh();
    } catch (candidateError) {
      setBusy("");
      setError(candidateError instanceof Error ? candidateError.message : "Academic candidate could not be created.");
    }
  }

  async function updateAcademicCandidate(candidate: AcademicCandidateRow, patch: Partial<AcademicCandidateRow>) {
    setBusy(`candidate-${candidate.id}`);
    setNotice("");
    setError("");
    const response = await fetch(`/api/academic-candidates/${candidate.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch)
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(body?.error ?? "Academic candidate could not be updated.");
      return;
    }
    setNotice("Academic clearance updated.");
    router.refresh();
  }

  async function addAcademicCourse(event: FormEvent<HTMLFormElement>, candidateId: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setBusy(`course-${candidateId}`);
    setNotice("");
    setError("");
    const response = await fetch(`/api/academic-candidates/${candidateId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        course: {
          courseCode: formText(formData, "courseCode") || null,
          courseTitle: formText(formData, "courseTitle"),
          credits: formText(formData, "credits") || null,
          grade: formText(formData, "grade") || null,
          status: "COMPLETED",
          completedAt: formText(formData, "completedAt") ? new Date(formText(formData, "completedAt")).toISOString() : null
        }
      })
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(body?.error ?? "Course record could not be added.");
      return;
    }
    form.reset();
    setNotice("Academic course record added.");
    router.refresh();
  }

  async function createSignatureProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setBusy("signature");
    setNotice("");
    setError("");
    try {
      const imageUrl =
        (await uploadCertificateSignatureData(formText(formData, "signatureDrawn"), "rector-signature")) ??
        (await uploadCertificateAsset(formData.get("signatureFile"), "rector-signature"));
      if (!imageUrl) {
        setBusy("");
        setError("Draw or upload a signature before saving it.");
        return;
      }
      const response = await fetch("/api/certificates/signatures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formText(formData, "name"),
          title: formText(formData, "title"),
          role: formText(formData, "role") || "RECTOR",
          imageUrl
        })
      });
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      setBusy("");
      if (!response.ok) {
        setError(body?.error ?? "Signature profile could not be saved.");
        return;
      }
      form.reset();
      setSignatureResetKey((value) => value + 1);
      setNotice("Official signature saved to the library.");
      router.refresh();
    } catch (signatureError) {
      setBusy("");
      setError(signatureError instanceof Error ? signatureError.message : "Signature profile could not be saved.");
    }
  }

  async function deleteSignatureProfile(id: string) {
    setBusy(`signature-${id}`);
    setNotice("");
    setError("");
    const response = await fetch(`/api/certificates/signatures/${id}`, { method: "DELETE" });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(body?.error ?? "Signature profile could not be deactivated.");
      return;
    }
    setNotice("Signature profile deactivated.");
    router.refresh();
  }

  async function createBatchCertificates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setBusy("batch");
    setNotice("");
    setError("");
    const response = await fetch("/api/certificates/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: formText(formData, "title"),
        signatureProfileId: formText(formData, "signatureProfileId") || null,
        csv: formText(formData, "csv") || null,
        candidateIds: Array.from(formData.getAll("candidateIds")).map(String),
        expiresAt: formText(formData, "expiresAt") ? new Date(formText(formData, "expiresAt")).toISOString() : null
      })
    });
    const body = (await response.json().catch(() => null)) as { error?: string; results?: Array<{ status: string }> } | null;
    setBusy("");
    if (!response.ok) {
      setError(body?.error ?? "Batch issuing failed.");
      return;
    }
    const issued = body?.results?.filter((result) => result.status === "ISSUED").length ?? 0;
    const failed = body?.results?.filter((result) => result.status === "FAILED").length ?? 0;
    form.reset();
    setNotice(`Batch completed: ${issued} issued, ${failed} failed.`);
    router.refresh();
  }

  async function reviewCorrectionRequest(id: string, action: "APPROVE" | "REJECT") {
    const reviewNote = window.prompt(action === "APPROVE" ? "Optional approval note for this correction" : "Why is this correction being rejected?");
    if (action === "REJECT" && !reviewNote?.trim()) return;
    setBusy(`correction-${action}-${id}`);
    setNotice("");
    setError("");
    const response = await fetch(`/api/certificates/corrections/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reviewNote })
    });
    const body = (await response.json().catch(() => null)) as { error?: string; replacement?: { certificateNumber?: string | null } } | null;
    setBusy("");
    if (!response.ok) {
      setError(body?.error ?? "Correction review failed.");
      return;
    }
    setNotice(
      action === "APPROVE"
        ? `Correction approved. Replacement certificate ${body?.replacement?.certificateNumber ?? "record"} was created and signed.`
        : "Correction request rejected."
    );
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {notice ? <p className="rounded-md border border-moss/15 bg-mint px-4 py-3 text-sm text-moss">{notice}</p> : null}
      {error ? <p className="rounded-md bg-clay/10 px-4 py-3 text-sm text-clay">{error}</p> : null}

      {canManage && (academicOnly || certificateCategory === "EDUCATION") ? (
        <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-lg border border-ink/10 bg-white p-4">
            <div className="mb-4">
              <p className="text-sm font-semibold text-ink">Student academic registry</p>
              <p className="mt-1 text-xs text-ink/55">Register theology candidates and clear them before certificate issuing.</p>
            </div>
            <form className="grid gap-3 lg:grid-cols-3" onSubmit={createAcademicCandidate}>
              <Input name="fullName" placeholder="Candidate full name" required />
              <Input name="email" placeholder="Email optional" type="email" />
              <Input name="phone" placeholder="Phone optional" />
              <Input name="programName" placeholder="Program name" required />
              <Input name="educationLevel" placeholder="Certificate / Diploma / BSc / MSc / PhD" required />
              <Input name="fieldOfStudy" placeholder="Field of study" defaultValue="Theology" />
              <Input name="organization" placeholder="Church / school / ministry optional" />
              <Input name="studyMode" placeholder="Study mode" />
              <label className="flex min-h-10 flex-col justify-center rounded-md border border-ink/10 bg-white px-3 py-2 text-xs text-ink/55">
                Candidate photo
                <input accept="image/png,image/jpeg,image/webp" className="mt-1 text-xs" name="photoFile" type="file" />
              </label>
              <Input name="admissionDate" type="date" />
              <Input name="graduationDate" type="date" />
              <Textarea className="lg:col-span-1" name="clearanceNotes" placeholder="Clearance notes optional" />
              <div className="flex flex-wrap gap-3 rounded-md bg-paper p-3 text-xs text-ink/65 lg:col-span-3">
                {[
                  ["feesCleared", "fees cleared"],
                  ["coursesCompleted", "courses completed"],
                  ["rectorApproved", "rector approved"],
                  ["photoUploaded", "photo uploaded"],
                  ["nameVerified", "name verified"]
                ].map(([name, label]) => (
                  <label className="flex items-center gap-2" key={name}>
                    <input name={name} type="checkbox" />
                    {label}
                  </label>
                ))}
              </div>
              <Button className="lg:col-span-3" disabled={busy === "candidate"} type="submit">
                {busy === "candidate" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}
                Add candidate
              </Button>
            </form>

            <div className="mt-5 grid gap-3">
              {academicCandidates.length === 0 ? <p className="rounded-md bg-paper px-4 py-4 text-sm text-ink/55">No academic candidates yet.</p> : null}
              {academicCandidates.slice(0, 12).map((candidate) => {
                const ready = academicCandidateReady(candidate);
                return (
                  <div className="rounded-lg border border-ink/10 bg-paper p-3" key={candidate.id}>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <p className="font-semibold text-ink">{candidate.fullName}</p>
                        <p className="mt-1 text-xs text-ink/55">{candidate.educationLevel} - {candidate.programName}</p>
                        <p className="mt-1 text-xs text-ink/55">{candidate.email ?? "No email"} - {candidate.certificates?.length ?? 0} certificates - {candidate.courses?.length ?? 0} courses</p>
                      </div>
                      <Badge className={ready ? "bg-mint text-moss" : "bg-[#fff6d8] text-[#7c5d00]"}>
                        {ready ? "cleared" : "pending clearance"}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {[
                        ["feesCleared", "Fees", candidate.feesCleared],
                        ["coursesCompleted", "Courses", candidate.coursesCompleted],
                        ["rectorApproved", "Rector", candidate.rectorApproved],
                        ["photoUploaded", "Photo", candidate.photoUploaded],
                        ["nameVerified", "Name", candidate.nameVerified]
                      ].map(([key, label, checked]) => (
                        <button
                          className={`rounded-full border px-3 py-1 ${checked ? "border-moss/20 bg-mint text-moss" : "border-ink/10 bg-white text-ink/55"}`}
                          key={String(key)}
                          type="button"
                          onClick={() => updateAcademicCandidate(candidate, { [String(key)]: !checked })}
                        >
                          {label}: {checked ? "yes" : "no"}
                        </button>
                      ))}
                    </div>
                    <form className="mt-3 grid gap-2 lg:grid-cols-[0.7fr_1.4fr_0.5fr_0.5fr_0.8fr_auto]" onSubmit={(event) => addAcademicCourse(event, candidate.id)}>
                      <Input name="courseCode" placeholder="Code" />
                      <Input name="courseTitle" placeholder="Course title" required />
                      <Input name="credits" placeholder="Credits" type="number" />
                      <Input name="grade" placeholder="Grade" />
                      <Input name="completedAt" type="date" />
                      <Button disabled={busy === `course-${candidate.id}`} type="submit" variant="secondary">
                        Add course
                      </Button>
                    </form>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-ink/10 bg-white p-4">
              <p className="text-sm font-semibold text-ink">Official signature library</p>
              <p className="mt-1 text-xs text-ink/55">Store rector, registrar, president, and secretary signatures once.</p>
              <form className="mt-3 space-y-3" onSubmit={createSignatureProfile}>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input name="name" placeholder="Signatory name" required />
                  <Input name="title" placeholder="Title, e.g. Rector" required />
                  <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="role" defaultValue="RECTOR">
                    <option value="RECTOR">Rector</option>
                    <option value="REGISTRAR">Registrar</option>
                    <option value="PRESIDENT">President</option>
                    <option value="SECRETARY">Secretary</option>
                    <option value="OTHER">Other</option>
                  </select>
                  <label className="flex min-h-10 flex-col justify-center rounded-md border border-ink/10 bg-white px-3 py-2 text-xs text-ink/55">
                    Signature image
                    <input accept="image/png,image/jpeg,image/webp" className="mt-1 text-xs" name="signatureFile" type="file" />
                  </label>
                </div>
                <SignaturePad label="Draw signature on screen" name="signatureDrawn" resetKey={signatureResetKey} />
                <Button disabled={busy === "signature"} type="submit">
                  {busy === "signature" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />}
                  Save signature
                </Button>
              </form>
              <div className="mt-4 space-y-2">
                {signatureProfiles.length === 0 ? <p className="rounded-md bg-paper px-3 py-3 text-sm text-ink/55">No stored signatures yet.</p> : null}
                {signatureProfiles.map((signature) => (
                  <div className="flex items-center justify-between gap-3 rounded-md border border-ink/10 bg-paper p-2" key={signature.id}>
                    <div className="flex min-w-0 items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img alt={`${signature.name} signature`} className="h-8 w-24 rounded bg-white object-contain" src={signature.imageUrl} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{signature.name}</p>
                        <p className="text-xs text-ink/55">{signature.title} - {signature.role.toLowerCase()}</p>
                      </div>
                    </div>
                    <Button className="h-8 px-2 text-xs" disabled={busy === `signature-${signature.id}`} type="button" variant="ghost" onClick={() => deleteSignatureProfile(signature.id)}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-ink/10 bg-white p-4">
              <p className="text-sm font-semibold text-ink">Batch issuing</p>
              <p className="mt-1 text-xs text-ink/55">Issue certificates only for cleared academic candidates.</p>
              <form className="mt-3 space-y-3" onSubmit={createBatchCertificates}>
                <Input name="title" placeholder="Certificate title" defaultValue="Certificate in Theology" required />
                <select className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" name="signatureProfileId">
                  <option value="">Use default rector signature</option>
                  {signatureProfiles.map((signature) => (
                    <option key={signature.id} value={signature.id}>{signature.name} - {signature.title}</option>
                  ))}
                </select>
                <Textarea name="csv" placeholder={"CSV rows: candidate id or name,email,program,level,completion date\nExample: Grace,grace@example.com,LETW School of Theology,Certificate in Theology,2026-07-16"} />
                <div className="max-h-40 space-y-1 overflow-auto rounded-md bg-paper p-2">
                  {academicCandidates.filter(academicCandidateReady).slice(0, 30).map((candidate) => (
                    <label className="flex items-center gap-2 text-xs text-ink/65" key={candidate.id}>
                      <input name="candidateIds" type="checkbox" value={candidate.id} />
                      {candidate.fullName} - {candidate.educationLevel}
                    </label>
                  ))}
                </div>
                <Input name="expiresAt" type="date" />
                <Button disabled={busy === "batch"} type="submit" variant="secondary">
                  {busy === "batch" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}
                  Issue batch
                </Button>
              </form>
              {batchJobs.length ? (
                <div className="mt-4 space-y-2">
                  {batchJobs.slice(0, 5).map((job) => (
                    <p className="rounded-md bg-paper px-3 py-2 text-xs text-ink/60" key={job.id}>
                      {job.title}: {job.issuedCount} issued, {job.failedCount} failed - {job.status.toLowerCase()}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="rounded-lg border border-ink/10 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-ink">Certificate correction requests</p>
                  <p className="mt-1 text-xs text-ink/55">Approve a corrected replacement or reject with a note.</p>
                </div>
                <Badge>{correctionRequests.filter((request) => request.status === "PENDING").length} pending</Badge>
              </div>
              <div className="mt-4 space-y-3">
                {correctionRequests.length === 0 ? <p className="rounded-md bg-paper px-3 py-3 text-sm text-ink/55">No correction requests yet.</p> : null}
                {correctionRequests.slice(0, 8).map((request) => (
                  <div className="rounded-md border border-ink/10 bg-paper p-3" key={request.id}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-ink">
                          {request.certificate?.certificateNumber ?? request.certificate?.title ?? "Certificate correction"}
                        </p>
                        <p className="mt-1 text-xs text-ink/55">
                          {request.candidate?.fullName ?? request.certificate?.recipientName ?? request.requesterName ?? "Candidate"} - {request.correctionType.toLowerCase()}
                        </p>
                      </div>
                      <Badge className={request.status === "PENDING" ? "bg-[#fff6d8] text-[#7c5d00]" : request.status === "APPROVED" ? "bg-mint text-moss" : "bg-clay/10 text-clay"}>
                        {request.status.toLowerCase()}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs leading-5 text-ink/60">{correctionChangeSummary(request.requestedChanges)}</p>
                    {request.reason ? <p className="mt-2 text-xs text-ink/50">Reason: {request.reason}</p> : null}
                    {request.reviewNote ? <p className="mt-2 text-xs text-ink/50">Review note: {request.reviewNote}</p> : null}
                    {request.status === "PENDING" ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          className="h-8 px-3 text-xs"
                          disabled={busy === `correction-APPROVE-${request.id}`}
                          type="button"
                          onClick={() => reviewCorrectionRequest(request.id, "APPROVE")}
                        >
                          {busy === `correction-APPROVE-${request.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
                          Approve
                        </Button>
                        <Button
                          className="h-8 px-3 text-xs"
                          disabled={busy === `correction-REJECT-${request.id}`}
                          type="button"
                          variant="ghost"
                          onClick={() => reviewCorrectionRequest(request.id, "REJECT")}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {canManage ? (
        <section className="rounded-lg border border-ink/10 bg-white p-4">
          <div className="mb-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Award className="h-4 w-4 text-moss" />
              {academicOnly ? "Issue an academic certificate" : "Issue a certificate"}
            </p>
            <p className="mt-1 text-xs text-ink/55">
              {academicOnly
                ? "Create theology certificates with candidate photo, rector signature, QR verification, and cryptographic protection."
                : "Generate official LETW certificates with public verification links."}
            </p>
          </div>
          <form className="space-y-4" onSubmit={createCertificate}>
            <div className={academicOnly ? "grid gap-3 lg:grid-cols-[1fr_1fr_1.2fr]" : "grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_1.2fr]"}>
              {academicOnly ? (
                <>
                  <input name="certificatePreset" type="hidden" value="THEOLOGY_DEGREE" />
                  <input name="certificateCategory" type="hidden" value="EDUCATION" />
                  <div className="rounded-md border border-[#0b1b3d]/10 bg-[#f8fbff] px-3 py-2 text-sm font-medium text-[#0b1b3d]">
                    Rector academic dashboard
                    <span className="block text-xs font-normal text-ink/55">Theology certificates only</span>
                  </div>
                </>
              ) : (
                <>
                  <select
                    className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm"
                    name="certificatePreset"
                    value={certificatePreset}
                    onChange={(event) => {
                      const nextPreset = event.target.value as CertificatePreset;
                      const defaults = certificatePresetDefaults(nextPreset);
                      setCertificatePreset(nextPreset);
                      setCertificateCategory(defaults.certificateCategory);
                    }}
                  >
                    {CERTIFICATE_PRESET_OPTIONS.map((preset) => (
                      <option key={preset.value} value={preset.value}>
                        {preset.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm"
                    name="certificateCategory"
                    value={certificateCategory}
                    onChange={(event) => {
                      const nextCategory = event.target.value as "MINISTRY" | "EDUCATION" | "MARRIAGE";
                      setCertificateCategory(nextCategory);
                      setCertificatePreset(defaultPresetForCategory(nextCategory) as CertificatePreset);
                    }}
                  >
                    <option value="MINISTRY">Ministry certificate</option>
                    <option value="EDUCATION">Theology education certificate</option>
                    <option value="MARRIAGE">Marriage certificate</option>
                  </select>
                </>
              )}
              <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="title" required>
                {(certificateCategory === "EDUCATION" ? THEOLOGY_CERTIFICATE_TYPES : certificateCategory === "MARRIAGE" ? MARRIAGE_CERTIFICATE_TYPES : MINISTRY_CERTIFICATE_TYPES).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <Input name="customTitle" placeholder="Custom certificate title optional" />
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
            <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="userId" required={certificateCategory === "MINISTRY"}>
              <option value="">{certificateCategory === "MINISTRY" ? "Select LETW member" : "Optional LETW member account"}</option>
              {users.map((user) => (
                <option key={user.id ?? user.email ?? user.name} value={user.id ?? ""}>
                  {displayName(user)} {user.memberProfile?.membershipNumber ? `- ${user.memberProfile.membershipNumber}` : ""}
                </option>
              ))}
            </select>
              <Input name="recipientName" placeholder={certificateCategory === "MARRIAGE" ? "Couple display name optional" : certificateCategory === "EDUCATION" ? "External candidate full name" : "Override holder name optional"} />
              <Input name="recipientEmail" placeholder="Candidate email optional" type="email" />
              <Input name="recipientPhone" placeholder="Candidate phone optional" />
              <label className="flex min-h-10 flex-col justify-center rounded-md border border-ink/10 bg-white px-3 py-2 text-xs text-ink/55">
                Candidate photo
                <input accept="image/png,image/jpeg,image/webp" className="mt-1 text-xs" name="recipientPhotoFile" type="file" />
              </label>
              <Input name="recipientOrganization" placeholder="Candidate church/ministry/school optional" />
            </div>

            <div className="rounded-lg border border-ink/10 bg-paper p-3" key={certificatePreset}>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink">Certificate template designer</p>
              <div className="mt-3 grid gap-3 lg:grid-cols-5">
                <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="templateStyle" defaultValue={activePresetDefaults.templateStyle}>
                  <option value="CLASSIC">Classic official</option>
                  <option value="ACADEMIC">Academic</option>
                  <option value="MARRIAGE_ELEGANT">Marriage elegant</option>
                  <option value="MODERN">Modern clean</option>
                  <option value="ROYAL">Royal ceremonial</option>
                </select>
                <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="templateAccent" defaultValue={activePresetDefaults.templateAccent}>
                  <option value="NAVY_GOLD">Navy and gold</option>
                  <option value="BLUE_GOLD">Blue and gold</option>
                  <option value="BURGUNDY_GOLD">Burgundy and gold</option>
                  <option value="GREEN_GOLD">Green and gold</option>
                  <option value="MONOCHROME">Monochrome</option>
                </select>
                <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="sealStyle" defaultValue={activePresetDefaults.sealStyle}>
                  <option value="CHIP">Seal chip</option>
                  <option value="EMBOSSED">Embossed seal</option>
                  <option value="ROUND">Round seal</option>
                  <option value="SCRIPTURE">Scripture seal</option>
                </select>
                <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="signatureLayout" defaultValue={activePresetDefaults.signatureLayout}>
                  <option value="DUAL">Dual signature</option>
                  <option value="PRESIDENT_LEFT">President left</option>
                  <option value="PRESIDENT_RIGHT">President right</option>
                </select>
                <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="watermarkStrength" defaultValue={activePresetDefaults.watermarkStrength}>
                  <option value="SUBTLE">Subtle watermark</option>
                  <option value="STANDARD">Standard watermark</option>
                  <option value="STRONG">Strong watermark</option>
                </select>
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-4">
                {certificateCategory !== "EDUCATION" ? (
                  <label className="flex min-h-10 flex-col justify-center rounded-md border border-ink/10 bg-white px-3 py-2 text-xs text-ink/55">
                    President signature image
                    <input accept="image/png,image/jpeg,image/webp" className="mt-1 text-xs" name="presidentSignatureFile" type="file" />
                  </label>
                ) : null}
                <Input name="secondSignatoryName" placeholder={certificateCategory === "EDUCATION" ? "Rector name optional" : "Second signatory name optional"} />
                <Input name="secondSignatoryTitle" placeholder={certificateCategory === "EDUCATION" ? "Rector" : "Second signatory title"} defaultValue={activePresetDefaults.secondSignatoryTitle} />
                <label className="flex min-h-10 flex-col justify-center rounded-md border border-ink/10 bg-white px-3 py-2 text-xs text-ink/55">
                  {certificateCategory === "EDUCATION" ? "Rector signature image" : "Second signature image"}
                  <input accept="image/png,image/jpeg,image/webp" className="mt-1 text-xs" name="secondSignatorySignatureFile" type="file" />
                </label>
              </div>
              <div className="mt-3">
                <SignaturePad
                  key={`${certificateCategory}-${signatureResetKey}`}
                  label={certificateCategory === "EDUCATION" ? "Draw rector signature on screen" : "Draw second signatory signature on screen"}
                  name="secondSignatorySignatureDrawn"
                  resetKey={signatureResetKey}
                />
              </div>
              <p className="mt-2 text-xs leading-5 text-ink/55">
                {certificateCategory === "EDUCATION"
                  ? "Education certificates use rector signature only. Draw it on screen, upload an original signature image, or leave it blank to use LETW_RECTOR_SIGNATURE_URL from the server."
                  : "Draw or upload original signature images when required; the files are stored with the certificate record."}
              </p>
            </div>

            {certificateCategory === "EDUCATION" ? (
              <div className="rounded-lg border border-[#0b1b3d]/10 bg-[#f8fbff] p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0b1b3d]">Theology education details</p>
                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                  <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="academicCandidateId" required>
                    <option value="">Select cleared academic candidate</option>
                    {academicCandidates.map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.fullName} - {candidate.educationLevel} - {academicCandidateReady(candidate) ? "cleared" : "pending"}
                      </option>
                    ))}
                  </select>
                  <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="signatureProfileId">
                    <option value="">Use uploaded/drawn/default rector signature</option>
                    {signatureProfiles.map((signature) => (
                      <option key={signature.id} value={signature.id}>
                        {signature.name} - {signature.title}
                      </option>
                    ))}
                  </select>
                  <Input name="educationLevel" placeholder="Level, e.g. Diploma" />
                  <Input name="programName" placeholder="Program name, e.g. LETW School of Theology" />
                  <Input name="fieldOfStudy" placeholder="Field of study, e.g. Theology" defaultValue="Theology" />
                  <Input name="gradeOrHonors" placeholder="Grade, honors, class, distinction" />
                  <Input name="studyMode" placeholder="Study mode, e.g. online / resident" />
                  <Input name="completionDate" type="date" />
                  <Input name="studyStartDate" type="date" />
                  <Input name="studyEndDate" type="date" />
                  <Input name="certificateNumber" placeholder="Certificate no. optional" />
                </div>
                <Textarea className="mt-3" name="customBody" placeholder="Custom education wording, credits, thesis title, authorization note, or academic distinction optional" />
              </div>
            ) : certificateCategory === "MARRIAGE" ? (
              <div className="rounded-lg border border-[#d4af37]/30 bg-[#fffaf0] p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0b1b3d]">Marriage certificate details</p>
                <div className="mt-3 grid gap-3 lg:grid-cols-3">
                  <Input name="spouseOneName" placeholder="Spouse one full name" required />
                  <Input name="spouseTwoName" placeholder="Spouse two full name" required />
                  <Input name="marriageDate" type="date" />
                  <Input name="spouseOneEmail" placeholder="Spouse one email optional" />
                  <Input name="spouseTwoEmail" placeholder="Spouse two email optional" />
                  <Input name="marriageLocation" placeholder="Marriage location" />
                  <label className="flex min-h-10 flex-col justify-center rounded-md border border-ink/10 bg-white px-3 py-2 text-xs text-ink/55">
                    Spouse one photo
                    <input accept="image/png,image/jpeg,image/webp" className="mt-1 text-xs" name="spouseOnePhotoFile" type="file" />
                  </label>
                  <label className="flex min-h-10 flex-col justify-center rounded-md border border-ink/10 bg-white px-3 py-2 text-xs text-ink/55">
                    Spouse two photo
                    <input accept="image/png,image/jpeg,image/webp" className="mt-1 text-xs" name="spouseTwoPhotoFile" type="file" />
                  </label>
                  <Input name="officiantName" placeholder="Officiating minister" />
                  <Input name="witnessOneName" placeholder="Witness one" />
                  <Input name="witnessTwoName" placeholder="Witness two" />
                  <Input name="certificateNumber" placeholder="Certificate no. optional" />
                </div>
                <Textarea className="mt-3" name="customBody" placeholder="Custom marriage wording, vows note, scripture, or register note optional" />
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-3">
                <Input name="certificateNumber" placeholder="Certificate no. optional" />
                <Input name="expiresAt" type="date" />
                <Textarea className="lg:col-span-1" name="customBody" placeholder="Custom certificate wording optional" />
              </div>
            )}

            {certificateCategory !== "MINISTRY" ? (
              <div className="grid gap-3 lg:grid-cols-2">
                <Input name="expiresAt" type="date" />
                <p className="rounded-md bg-mint px-3 py-2 text-xs leading-5 text-moss">
                  {certificateCategory === "EDUCATION" ? "Nonmembers are allowed for theology education certificates." : "Marriage certificates can be issued to couples without LETW member accounts."} The QR page verifies the live LETW register record, seal number, cryptographic hash, and status.
                </p>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              {certificateCategory === "EDUCATION" ? (
                <Button disabled={busy === "create"} name="intent" type="submit" value="preview" variant="secondary">
                  {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                  Create approval preview
                </Button>
              ) : null}
              <Button disabled={busy === "create"} name="intent" type="submit" value="issue">
                {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}
                {academicOnly ? "Issue academic certificate" : "Generate secure certificate"}
              </Button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="rounded-lg border border-ink/10 bg-white">
        <div className="flex flex-col gap-3 border-b border-ink/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink">{academicOnly ? "Academic certificate register" : "Certificate register"}</h2>
            <p className="mt-1 text-xs text-ink/55">
              {academicOnly
                ? "Theology certificates, candidate photos, rector signatures, live QR status, and academic seal records."
                : "Baptism, membership, training, ordination, conference, and volunteer certificates."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Input className="w-64" value={query} placeholder="Search certificates" onChange={(event) => setQuery(event.target.value)} />
            <Button variant="secondary" onClick={printCertificates}>
              <Printer className="h-4 w-4" />
              Print certificates
            </Button>
          </div>
        </div>

        <div className="certificate-print-zone grid gap-5 p-4">
          {filteredCertificates.length === 0 ? (
            <p className="rounded-md bg-paper px-4 py-8 text-sm text-ink/55">No certificates found.</p>
          ) : null}
          {filteredCertificates.map((certificate) => {
            const valid = certificateIsLive(certificate);
            const publicStatus = certificatePublicStatus(certificate).toLowerCase();
            const verifyHref = `/verify/certificate/${certificate.verifyToken}`;
            const certificateCode = certificate.certificateNumber ?? `LETW-CERT-${certificate.id.slice(-8).toUpperCase()}`;
            const isEducation = certificate.certificateCategory === "EDUCATION";
            const isMarriage = certificate.certificateCategory === "MARRIAGE";
            const presetClass = certificate.certificatePreset ? `certificate-preset-${certificate.certificatePreset.toLowerCase().replaceAll("_", "-")}` : "";
            const position = isMarriage
              ? "Holy Matrimony"
              : isEducation
              ? certificate.educationLevel ?? certificate.programName ?? "Theology Candidate"
              : certificate.user.memberProfile?.organizationPosition ?? "LETW Member";
            const membershipNumber = certificate.user.memberProfile?.membershipNumber ?? (isEducation ? "Education candidate" : isMarriage ? "Marriage register" : "Member number pending");
            const holderName = isMarriage ? `${certificate.spouseOneName ?? "Spouse one"} and ${certificate.spouseTwoName ?? "Spouse two"}` : certificate.recipientName || displayName(certificate.user);
            const photoSrc = certificate.recipientPhotoUrl || (isMarriage ? "" : certificate.user.image || (certificate.user.id ? `/api/profile/photo/${certificate.user.id}` : ""));
            const statement = certificate.customBody || (isMarriage
              ? `${certificate.spouseOneName ?? "The couple"} and ${certificate.spouseTwoName ?? ""} were joined in holy matrimony under Light Encounter Tabernacle Worldwide${certificate.marriageDate ? ` on ${formatDate(certificate.marriageDate)}` : ""}${certificate.marriageLocation ? ` at ${certificate.marriageLocation}` : ""}.`
              : isEducation
              ? `has successfully completed the required studies for ${certificate.programName || certificate.title} in ${certificate.fieldOfStudy || "Theology"} and is recorded in the LETW educational credential register.`
              : "has been officially recorded and recognized by Light Encounter Tabernacle Worldwide. This certificate is valid only when the QR verification page confirms an active status.");

            return (
              <article className={`official-certificate overflow-hidden rounded-xl border border-ink/10 bg-white shadow-soft ${presetClass} ${isEducation ? "education-certificate" : ""} ${isMarriage ? "marriage-certificate" : ""}`} key={certificate.id}>
                <div className="official-certificate-inner">
                  <div className="certificate-watermark" aria-hidden="true" />
                  <header className="certificate-header">
                    <div className="certificate-brand">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img alt="LETW logo" src="/letw-logo.png" />
                      <div>
                        <p>Light Encounter Tabernacle Worldwide</p>
                        <span>letw.org official credential</span>
                      </div>
                    </div>
                    <Badge className={valid ? "certificate-status-active" : "certificate-status-inactive"}>
                      {valid ? "verified active" : publicStatus}
                    </Badge>
                  </header>

                  <div className="certificate-body">
                    <section className="certificate-main-copy">
                      <p className="certificate-eyebrow">{isMarriage ? "LETW Marriage Register Credential" : isEducation ? "LETW School of Theology Academic Credential" : "Certificate of LETW Recognition"}</p>
                      <h3>{certificate.title}</h3>
                      <p className="certificate-intro">This certifies that</p>
                      <h4>{holderName}</h4>
                      <p className="certificate-position">{position}</p>
                      <p className="certificate-statement">{statement}</p>
                    </section>

                    <aside className="certificate-identity">
                      <div className="certificate-photo">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          alt={`${holderName} profile`}
                          src={photoSrc}
                          onError={(event) => {
                            event.currentTarget.style.display = "none";
                          }}
                        />
                        <span>{initials(certificate.user)}</span>
                      </div>
                      <div className="certificate-seal">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt="LETW official seal" src="/letw-logo-transparent.png" />
                        <span>Verifiable seal chip</span>
                        <small>QR confirms live status</small>
                      </div>
                    </aside>
                  </div>

                  <section className="certificate-details">
                    <div>
                      <span>Certificate number</span>
                      <strong>{certificateCode}</strong>
                    </div>
                    <div>
                      <span>{isEducation ? "Candidate / registry" : "Member number"}</span>
                      <strong>{membershipNumber}</strong>
                    </div>
                    {isEducation ? (
                      <div>
                        <span>Seal number</span>
                        <strong>{certificate.sealNumber ?? "Pending seal"}</strong>
                      </div>
                    ) : null}
                    {isMarriage ? (
                      <>
                        <div>
                          <span>Marriage date</span>
                          <strong>{certificate.marriageDate ? formatDate(certificate.marriageDate) : "Pending"}</strong>
                        </div>
                        <div>
                          <span>Officiant</span>
                          <strong>{certificate.officiantName ?? "LETW Minister"}</strong>
                        </div>
                      </>
                    ) : null}
                    <div>
                      <span>Issued</span>
                      <strong>{formatDate(certificate.issuedAt)}</strong>
                    </div>
                    <div>
                      <span>Expires</span>
                      <strong>{certificate.expiresAt ? formatDate(certificate.expiresAt) : "No expiry"}</strong>
                    </div>
                  </section>

                  <footer className="certificate-footer">
                    {!isEducation ? (
                      <div className="certificate-signature">
                        {certificate.presidentSignatureUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img alt="President signature" src={certificate.presidentSignatureUrl} />
                        ) : (
                          <PenLine className="h-4 w-4" />
                        )}
                        <p>Olawale N Sanni</p>
                        <span>{certificate.presidentSignatureUrl ? "President / Original Signature" : "President / Authorized Signature"}</span>
                      </div>
                    ) : null}
                    {certificate.secondSignatoryName || certificate.secondSignatoryTitle || isEducation || isMarriage ? (
                      <div className="certificate-signature">
                        {certificate.secondSignatorySignatureUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img alt="Second signatory signature" src={certificate.secondSignatorySignatureUrl} />
                        ) : (
                          <PenLine className="h-4 w-4" />
                        )}
                        <p>{isEducation ? certificate.secondSignatoryName && certificate.secondSignatoryName !== "Registrar" ? certificate.secondSignatoryName : "Rector" : certificate.secondSignatoryName ?? (isMarriage ? certificate.officiantName ?? "Officiating Minister" : "Authorized Officer")}</p>
                        <span>{isEducation ? "Rector" : certificate.secondSignatoryTitle ?? (isMarriage ? "Officiating Minister" : "Second Signatory")}</span>
                      </div>
                    ) : null}
                    <div className="certificate-chip">
                      <Stamp className="h-5 w-5" />
                      <div>
                        <p>Credential code</p>
                        <span>{certificate.sealNumber ?? certificateCode}</span>
                      </div>
                    </div>
                    <div className="certificate-qr">
                      <div>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          alt={`QR verification code for ${certificateCode}`}
                          src={`/api/certificates/${certificate.id}/qr`}
                        />
                      </div>
                      <p>
                        <QrCode className="h-3.5 w-3.5" />
                        Scan to verify
                      </p>
                    </div>
                  </footer>

                  <div className="certificate-verification-note">
                    <BadgeCheck className="h-4 w-4" />
                    Accept this certificate only after scanning the QR code or opening the verification page.
                  </div>

                  <div className="certificate-actions certificate-nonprint flex flex-wrap items-center gap-2 border-t border-ink/10 bg-paper p-4">
                    <a className="inline-flex h-9 items-center gap-2 rounded-md border border-ink/10 bg-white px-3 text-sm font-medium text-ink hover:bg-mint/40" href={`/api/certificates/${certificate.id}/pdf`}>
                      <Download className="h-4 w-4" />
                      Download PDF
                    </a>
                    <a className="inline-flex h-9 items-center gap-2 rounded-md border border-ink/10 bg-white px-3 text-sm font-medium text-ink hover:bg-mint/40" href={verifyHref} rel="noreferrer" target="_blank">
                      <ExternalLink className="h-4 w-4" />
                      Verify
                    </a>
                    {canManage ? (
                      certificate.status === "DRAFT" ? (
                        <Button
                          className="h-9"
                          disabled={busy === `ISSUE-${certificate.id}`}
                          onClick={() => updateCertificate(certificate.id, "ISSUE")}
                        >
                          {busy === `ISSUE-${certificate.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                          Issue preview
                        </Button>
                      ) : valid ? (
                        <Button
                          className="h-9"
                          disabled={busy === `REVOKE-${certificate.id}`}
                          variant="danger"
                          onClick={() => updateCertificate(certificate.id, "REVOKE")}
                        >
                          {busy === `REVOKE-${certificate.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
                          Revoke
                        </Button>
                      ) : (
                        <Button
                          className="h-9"
                          disabled={busy === `RESTORE-${certificate.id}`}
                          variant="secondary"
                          onClick={() => updateCertificate(certificate.id, "RESTORE")}
                        >
                          {busy === `RESTORE-${certificate.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                          Restore
                        </Button>
                      )
                    ) : null}
                    {canManage ? (
                      <Button
                        className="h-9"
                        disabled={busy === `REISSUE-${certificate.id}`}
                        variant="secondary"
                        onClick={() => updateCertificate(certificate.id, "REISSUE")}
                      >
                        {busy === `REISSUE-${certificate.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        Reissue
                      </Button>
                    ) : null}
                    {canManage ? (
                      <Button
                        className="h-9"
                        disabled={busy === `DELETE-${certificate.id}`}
                        variant="danger"
                        onClick={() => deleteCertificate(certificate.id, certificate.title)}
                      >
                        {busy === `DELETE-${certificate.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        Delete
                      </Button>
                    ) : null}
                    <span className="ml-auto flex items-center gap-2 text-xs text-ink/55">
                      <ShieldCheck className="h-4 w-4 text-moss" />
                      QR verified public certificate
                    </span>
                  </div>
                  {!valid ? (
                    <div className="certificate-invalid-stamp" aria-hidden="true">
                      {certificate.status === "DRAFT" ? "Preview draft" : "Not valid"}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
