"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Award, BadgeCheck, Download, ExternalLink, Loader2, PenLine, Printer, QrCode, RotateCcw, ShieldCheck, ShieldOff, Stamp, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  sealNumber?: string | null;
  credentialHash?: string | null;
  verifyToken: string;
  status: string;
  issuedAt: string | Date;
  expiresAt?: string | Date | null;
  revokedAt?: string | Date | null;
  user: CertificateUser;
};

const certificateTypes = [
  "Baptism Certificate",
  "Membership Certificate",
  "Training Completion Certificate",
  "Ordination Certificate",
  "Conference Certificate",
  "Volunteer Service Certificate"
] as const;

const theologyCertificateTypes = [
  "Certificate in Theology",
  "Diploma in Theology",
  "Advanced Diploma in Theology",
  "Bachelor of Science in Theology",
  "Master of Science in Theology",
  "Doctor of Philosophy in Theology"
] as const;

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

export function CertificateGeneratorPanel({
  users,
  certificates,
  canManage
}: {
  users: CertificateUser[];
  certificates: CertificateRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [certificateCategory, setCertificateCategory] = useState<"MINISTRY" | "EDUCATION">("MINISTRY");

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

  async function createCertificate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    setBusy("create");
    setNotice("");
    setError("");

    const response = await fetch("/api/certificates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: payload.userId || null,
        title: payload.customTitle || payload.title,
        certificateCategory: payload.certificateCategory,
        recipientName: payload.recipientName || undefined,
        recipientEmail: payload.recipientEmail || undefined,
        recipientPhone: payload.recipientPhone || undefined,
        recipientPhotoUrl: payload.recipientPhotoUrl || undefined,
        recipientOrganization: payload.recipientOrganization || undefined,
        educationLevel: payload.educationLevel || undefined,
        programName: payload.programName || payload.title,
        fieldOfStudy: payload.fieldOfStudy || (payload.certificateCategory === "EDUCATION" ? "Theology" : undefined),
        gradeOrHonors: payload.gradeOrHonors || undefined,
        studyMode: payload.studyMode || undefined,
        studyStartDate: payload.studyStartDate ? new Date(payload.studyStartDate).toISOString() : null,
        studyEndDate: payload.studyEndDate ? new Date(payload.studyEndDate).toISOString() : null,
        completionDate: payload.completionDate ? new Date(payload.completionDate).toISOString() : null,
        customBody: payload.customBody || undefined,
        certificateNumber: payload.certificateNumber || undefined,
        expiresAt: payload.expiresAt ? new Date(payload.expiresAt).toISOString() : null
      })
    });
    const body = (await response.json().catch(() => null)) as { error?: string; pendingApproval?: { id: string } } | null;
    setBusy("");

    if (!response.ok) {
      setError(body?.error ?? "Certificate could not be created.");
      return;
    }

    form.reset();
    setNotice(body?.pendingApproval ? "Certificate request sent to the president for approval." : "Certificate created.");
    router.refresh();
  }

  async function updateCertificate(id: string, action: "REVOKE" | "RESTORE") {
    setBusy(`${action}-${id}`);
    setNotice("");
    setError("");
    const response = await fetch(`/api/certificates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action })
    });
    const body = (await response.json().catch(() => null)) as { error?: string; pendingApproval?: { id: string } } | null;
    setBusy("");

    if (!response.ok) {
      setError(body?.error ?? "Certificate action failed.");
      return;
    }

    setNotice(body?.pendingApproval ? "Certificate action sent to the president for approval." : action === "REVOKE" ? "Certificate revoked." : "Certificate restored.");
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

  return (
    <div className="space-y-6">
      {notice ? <p className="rounded-md border border-moss/15 bg-mint px-4 py-3 text-sm text-moss">{notice}</p> : null}
      {error ? <p className="rounded-md bg-clay/10 px-4 py-3 text-sm text-clay">{error}</p> : null}

      {canManage ? (
        <section className="rounded-lg border border-ink/10 bg-white p-4">
          <div className="mb-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Award className="h-4 w-4 text-moss" />
              Issue a certificate
            </p>
            <p className="mt-1 text-xs text-ink/55">Generate official LETW certificates with public verification links.</p>
          </div>
          <form className="space-y-4" onSubmit={createCertificate}>
            <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.2fr]">
              <select
                className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm"
                name="certificateCategory"
                value={certificateCategory}
                onChange={(event) => setCertificateCategory(event.target.value as "MINISTRY" | "EDUCATION")}
              >
                <option value="MINISTRY">Ministry certificate</option>
                <option value="EDUCATION">Theology education certificate</option>
              </select>
              <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="title" required>
                {(certificateCategory === "EDUCATION" ? theologyCertificateTypes : certificateTypes).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
              <Input name="customTitle" placeholder="Custom certificate title optional" />
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
            <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="userId" required={certificateCategory === "MINISTRY"}>
              <option value="">{certificateCategory === "EDUCATION" ? "Optional LETW member account" : "Select LETW member"}</option>
              {users.map((user) => (
                <option key={user.id ?? user.email ?? user.name} value={user.id ?? ""}>
                  {displayName(user)} {user.memberProfile?.membershipNumber ? `- ${user.memberProfile.membershipNumber}` : ""}
                </option>
              ))}
            </select>
              <Input name="recipientName" placeholder={certificateCategory === "EDUCATION" ? "External candidate full name" : "Override holder name optional"} />
              <Input name="recipientEmail" placeholder="Candidate email optional" type="email" />
              <Input name="recipientPhone" placeholder="Candidate phone optional" />
              <Input name="recipientPhotoUrl" placeholder="Candidate photo URL optional" />
              <Input name="recipientOrganization" placeholder="Candidate church/ministry/school optional" />
            </div>

            {certificateCategory === "EDUCATION" ? (
              <div className="rounded-lg border border-[#0b1b3d]/10 bg-[#f8fbff] p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0b1b3d]">Theology education details</p>
                <div className="mt-3 grid gap-3 lg:grid-cols-3">
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
            ) : (
              <div className="grid gap-3 lg:grid-cols-3">
                <Input name="certificateNumber" placeholder="Certificate no. optional" />
                <Input name="expiresAt" type="date" />
                <Textarea className="lg:col-span-1" name="customBody" placeholder="Custom certificate wording optional" />
              </div>
            )}

            {certificateCategory === "EDUCATION" ? (
              <div className="grid gap-3 lg:grid-cols-2">
                <Input name="expiresAt" type="date" />
                <p className="rounded-md bg-mint px-3 py-2 text-xs leading-5 text-moss">
                  Nonmembers are allowed for theology education certificates. The QR page verifies the live LETW register record, seal number, cryptographic hash, and status.
                </p>
              </div>
            ) : null}

            <Button disabled={busy === "create"} type="submit">
              {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}
              Generate secure certificate
            </Button>
          </form>
        </section>
      ) : null}

      <section className="rounded-lg border border-ink/10 bg-white">
        <div className="flex flex-col gap-3 border-b border-ink/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink">Certificate register</h2>
            <p className="mt-1 text-xs text-ink/55">Baptism, membership, training, ordination, conference, and volunteer certificates.</p>
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
            const position = isEducation
              ? certificate.educationLevel ?? certificate.programName ?? "Theology Candidate"
              : certificate.user.memberProfile?.organizationPosition ?? "LETW Member";
            const membershipNumber = certificate.user.memberProfile?.membershipNumber ?? (isEducation ? "Education candidate" : "Member number pending");
            const holderName = certificate.recipientName || displayName(certificate.user);
            const photoSrc = certificate.recipientPhotoUrl || certificate.user.image || (certificate.user.id ? `/api/profile/photo/${certificate.user.id}` : "");
            const statement = certificate.customBody || (isEducation
              ? `has successfully completed the required studies for ${certificate.programName || certificate.title} in ${certificate.fieldOfStudy || "Theology"} and is recorded in the LETW educational credential register.`
              : "has been officially recorded and recognized by Light Encounter Tabernacle Worldwide. This certificate is valid only when the QR verification page confirms an active status.");

            return (
              <article className={`official-certificate overflow-hidden rounded-xl border border-ink/10 bg-white shadow-soft ${isEducation ? "education-certificate" : ""}`} key={certificate.id}>
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
                      <p className="certificate-eyebrow">{isEducation ? "LETW School of Theology Academic Credential" : "Certificate of LETW Recognition"}</p>
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
                    <div className="certificate-signature">
                      <PenLine className="h-4 w-4" />
                      <p>Olawale N Sanni</p>
                      <span>President / Authorized Signature</span>
                    </div>
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
                      valid ? (
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
                      Not valid
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
