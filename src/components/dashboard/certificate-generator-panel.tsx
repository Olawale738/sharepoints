"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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

function defaultPresetForCategory(category: "MINISTRY" | "EDUCATION" | "MARRIAGE") {
  if (category === "EDUCATION") return "THEOLOGY_DEGREE";
  if (category === "MARRIAGE") return "MARRIAGE_COVENANT";
  return "MEMBERSHIP_COVENANT";
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
  const [certificateCategory, setCertificateCategory] = useState<"MINISTRY" | "EDUCATION" | "MARRIAGE">("MINISTRY");
  const [certificatePreset, setCertificatePreset] = useState<CertificatePreset>("MEMBERSHIP_COVENANT");
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
        certificatePreset: payload.certificatePreset || certificatePreset,
        templateStyle: payload.templateStyle || undefined,
        templateAccent: payload.templateAccent || undefined,
        sealStyle: payload.sealStyle || undefined,
        signatureLayout: payload.signatureLayout || undefined,
        watermarkStrength: payload.watermarkStrength || undefined,
        presidentSignatureUrl: payload.presidentSignatureUrl || undefined,
        secondSignatoryName: payload.secondSignatoryName || undefined,
        secondSignatoryTitle: payload.secondSignatoryTitle || undefined,
        secondSignatorySignatureUrl: payload.secondSignatorySignatureUrl || undefined,
        spouseOneName: payload.spouseOneName || undefined,
        spouseOneEmail: payload.spouseOneEmail || undefined,
        spouseOnePhotoUrl: payload.spouseOnePhotoUrl || undefined,
        spouseTwoName: payload.spouseTwoName || undefined,
        spouseTwoEmail: payload.spouseTwoEmail || undefined,
        spouseTwoPhotoUrl: payload.spouseTwoPhotoUrl || undefined,
        marriageDate: payload.marriageDate ? new Date(payload.marriageDate).toISOString() : null,
        marriageLocation: payload.marriageLocation || undefined,
        officiantName: payload.officiantName || undefined,
        witnessOneName: payload.witnessOneName || undefined,
        witnessTwoName: payload.witnessTwoName || undefined,
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

  async function updateCertificate(id: string, action: "REVOKE" | "RESTORE" | "REISSUE") {
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

    setNotice(body?.pendingApproval ? "Certificate action sent to the president for approval." : action === "REVOKE" ? "Certificate revoked." : action === "REISSUE" ? "Certificate reissued and old certificate replaced." : "Certificate restored.");
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
            <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_1.2fr]">
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
              <Input name="recipientPhotoUrl" placeholder="Candidate photo URL optional" />
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
                <Input name="presidentSignatureUrl" placeholder="President signature image URL optional" />
                <Input name="secondSignatoryName" placeholder="Second signatory name, e.g. Registrar" />
                <Input name="secondSignatoryTitle" placeholder="Registrar / Academic Dean / Rector / Officiant" defaultValue={activePresetDefaults.secondSignatoryTitle} />
                <Input name="secondSignatorySignatureUrl" placeholder="Second signature image URL optional" />
              </div>
              <p className="mt-2 text-xs leading-5 text-ink/55">
                For theology certificates, add the president signature URL and registrar signature URL here. If left blank, LETW can use server
                defaults from <span className="font-semibold">LETW_PRESIDENT_SIGNATURE_URL</span> and <span className="font-semibold">LETW_REGISTRAR_SIGNATURE_URL</span>.
              </p>
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
                  <Input name="spouseOnePhotoUrl" placeholder="Spouse one photo URL optional" />
                  <Input name="spouseTwoPhotoUrl" placeholder="Spouse two photo URL optional" />
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
                    {certificate.secondSignatoryName || certificate.secondSignatoryTitle || isEducation || isMarriage ? (
                      <div className="certificate-signature">
                        {certificate.secondSignatorySignatureUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img alt="Second signatory signature" src={certificate.secondSignatorySignatureUrl} />
                        ) : (
                          <PenLine className="h-4 w-4" />
                        )}
                        <p>{certificate.secondSignatoryName ?? (isMarriage ? certificate.officiantName ?? "Officiating Minister" : "Registrar")}</p>
                        <span>{certificate.secondSignatoryTitle ?? (isMarriage ? "Officiating Minister" : "Registrar / Academic Dean / Rector")}</span>
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
