"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Award, BadgeCheck, Download, ExternalLink, Loader2, PenLine, Printer, QrCode, RotateCcw, ShieldCheck, ShieldOff, Stamp, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CertificateUser = {
  id: string;
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
  userId: string;
  title: string;
  issuer: string;
  certificateNumber?: string | null;
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
        userId: payload.userId,
        title: payload.title,
        certificateNumber: payload.certificateNumber || undefined,
        expiresAt: payload.expiresAt ? new Date(payload.expiresAt).toISOString() : null
      })
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");

    if (!response.ok) {
      setError(body?.error ?? "Certificate could not be created.");
      return;
    }

    form.reset();
    setNotice("Certificate created.");
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
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");

    if (!response.ok) {
      setError(body?.error ?? "Certificate action failed.");
      return;
    }

    setNotice(action === "REVOKE" ? "Certificate revoked." : "Certificate restored.");
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
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");

    if (!response.ok) {
      setError(body?.error ?? "Certificate could not be deleted.");
      return;
    }

    setNotice("Certificate deleted.");
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
          <form className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1fr_1fr_auto]" onSubmit={createCertificate}>
            <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="userId" required>
              <option value="">Select member</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {displayName(user)} {user.memberProfile?.membershipNumber ? `- ${user.memberProfile.membershipNumber}` : ""}
                </option>
              ))}
            </select>
            <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="title" required>
              {certificateTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <Input name="certificateNumber" placeholder="Certificate no. optional" />
            <Input name="expiresAt" type="date" />
            <Button disabled={busy === "create"} type="submit">
              {busy === "create" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Award className="h-4 w-4" />}
              Generate
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
            const valid = certificate.status === "ACTIVE" && !certificate.revokedAt && (!certificate.expiresAt || new Date(certificate.expiresAt) > new Date());
            const verifyHref = `/verify/certificate/${certificate.verifyToken}`;
            const certificateCode = certificate.certificateNumber ?? `LETW-CERT-${certificate.id.slice(-8).toUpperCase()}`;
            const position = certificate.user.memberProfile?.organizationPosition ?? "LETW Member";
            const membershipNumber = certificate.user.memberProfile?.membershipNumber ?? "Member number pending";
            const photoSrc = certificate.user.image || `/api/profile/photo/${certificate.user.id}`;

            return (
              <article className="official-certificate overflow-hidden rounded-xl border border-ink/10 bg-white shadow-soft" key={certificate.id}>
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
                      {valid ? "verified active" : certificate.revokedAt ? "revoked" : "inactive"}
                    </Badge>
                  </header>

                  <div className="certificate-body">
                    <section className="certificate-main-copy">
                      <p className="certificate-eyebrow">Certificate of LETW Recognition</p>
                      <h3>{certificate.title}</h3>
                      <p className="certificate-intro">This certifies that</p>
                      <h4>{displayName(certificate.user)}</h4>
                      <p className="certificate-position">{position}</p>
                      <p className="certificate-statement">
                        has been officially recorded and recognized by Light Encounter Tabernacle Worldwide. This certificate is valid only
                        when the QR verification page confirms an active status.
                      </p>
                    </section>

                    <aside className="certificate-identity">
                      <div className="certificate-photo">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          alt={`${displayName(certificate.user)} profile`}
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
                        <span>Official Seal</span>
                      </div>
                    </aside>
                  </div>

                  <section className="certificate-details">
                    <div>
                      <span>Certificate number</span>
                      <strong>{certificateCode}</strong>
                    </div>
                    <div>
                      <span>Member number</span>
                      <strong>{membershipNumber}</strong>
                    </div>
                    <div>
                      <span>Issued</span>
                      <strong>{formatDate(certificate.issuedAt)}</strong>
                    </div>
                    <div>
                      <span>Expires</span>
                      <strong>{formatDate(certificate.expiresAt)}</strong>
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
                        <p>Seal chip</p>
                        <span>{certificateCode}</span>
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
