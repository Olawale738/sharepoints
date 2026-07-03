"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Award, ExternalLink, Loader2, Printer, RotateCcw, ShieldOff } from "lucide-react";

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
            <Button variant="secondary" onClick={() => window.print()}>
              <Printer className="h-4 w-4" />
              Print
            </Button>
          </div>
        </div>

        <div className="grid gap-4 p-4 xl:grid-cols-2">
          {filteredCertificates.length === 0 ? (
            <p className="rounded-md bg-paper px-4 py-8 text-sm text-ink/55">No certificates found.</p>
          ) : null}
          {filteredCertificates.map((certificate) => {
            const valid = certificate.status === "ACTIVE" && !certificate.revokedAt && (!certificate.expiresAt || new Date(certificate.expiresAt) > new Date());
            const verifyHref = `/api/certificates/verify/${certificate.verifyToken}`;

            return (
              <article className="overflow-hidden rounded-lg border border-ink/10 bg-white certificate-print-card" key={certificate.id}>
                <div className="bg-[#0b1b3d] px-5 py-4 text-white">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#d4af37]">Light Encounter Tabernacle Worldwide</p>
                      <h3 className="mt-2 text-xl font-semibold">{certificate.title}</h3>
                    </div>
                    <Badge className={valid ? "border-white/20 bg-white/10 text-white" : "bg-clay text-white"}>
                      {valid ? "valid" : certificate.revokedAt ? "revoked" : "inactive"}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-4 p-5">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-ink/45">Awarded to</p>
                    <p className="mt-1 text-2xl font-semibold text-ink">{displayName(certificate.user)}</p>
                    <p className="text-sm text-ink/55">
                      {certificate.user.memberProfile?.organizationPosition ?? "LETW Member"} -{" "}
                      {certificate.user.memberProfile?.membershipNumber ?? "Member number pending"}
                    </p>
                  </div>
                  <div className="grid gap-3 text-sm sm:grid-cols-3">
                    <div className="rounded-md bg-paper p-3">
                      <p className="text-xs text-ink/45">Certificate no.</p>
                      <p className="mt-1 font-semibold text-ink">{certificate.certificateNumber ?? "Pending"}</p>
                    </div>
                    <div className="rounded-md bg-paper p-3">
                      <p className="text-xs text-ink/45">Issued</p>
                      <p className="mt-1 font-semibold text-ink">{formatDate(certificate.issuedAt)}</p>
                    </div>
                    <div className="rounded-md bg-paper p-3">
                      <p className="text-xs text-ink/45">Expires</p>
                      <p className="mt-1 font-semibold text-ink">{formatDate(certificate.expiresAt)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <a className="inline-flex h-9 items-center gap-2 rounded-md border border-ink/10 px-3 text-sm font-medium text-ink hover:bg-mint/40" href={verifyHref} target="_blank">
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
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
