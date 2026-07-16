import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { Award, ShieldAlert, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { recordCertificateEvent } from "@/lib/certificate-lifecycle";
import { certificatePresetDisplay, inferCertificatePreset } from "@/lib/certificate-presets";
import { certificateIsLive, certificatePublicStatus } from "@/lib/certificates";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

type PageContext = {
  params: Promise<{ token: string }>;
};

export default async function CertificateVerificationPage(context: PageContext) {
  const { token } = await context.params;
  const certificate = await prisma.memberCertificationBadge.findUnique({
    where: { verifyToken: token }
  });
  const user = certificate?.userId
    ? await prisma.user.findUnique({
        where: { id: certificate.userId },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          memberProfile: {
            select: {
              membershipNumber: true,
              organizationPosition: true
            }
          }
        }
      })
    : null;
  const valid = Boolean(certificate && certificateIsLive(certificate));
  const statusLabel = certificate ? certificatePublicStatus(certificate).toLowerCase() : "not found";
  const isMarriage = certificate?.certificateCategory === "MARRIAGE";
  const holderName = isMarriage
    ? `${certificate?.spouseOneName ?? "Spouse one"} and ${certificate?.spouseTwoName ?? "Spouse two"}`
    : user?.name ?? certificate?.recipientName ?? "LETW Certificate Holder";
  const holderPosition = isMarriage ? "Holy Matrimony" : user?.memberProfile?.organizationPosition ?? certificate?.educationLevel ?? certificate?.programName ?? "Certificate holder";
  const holderNumber = user?.memberProfile?.membershipNumber ?? (certificate?.certificateCategory === "EDUCATION" ? "Education candidate" : "Pending");
  const photoSrc = certificate?.recipientPhotoUrl || certificate?.spouseOnePhotoUrl || (user && certificate ? `/api/profile/photo/${user.id}?certificateToken=${encodeURIComponent(certificate.verifyToken)}` : null);
  const presetDisplay = certificate
    ? certificatePresetDisplay(inferCertificatePreset({
        certificatePreset: certificate.certificatePreset,
        certificateCategory: certificate.certificateCategory,
        title: certificate.title
      }))
    : null;
  if (certificate) {
    const requestHeaders = await headers();
    await recordCertificateEvent({
      certificateId: certificate.id,
      eventType: "SCANNED",
      summary: "Certificate QR verification page opened.",
      ipAddress: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: requestHeaders.get("user-agent")
    }).catch(() => null);
  }
  const timeline = certificate
    ? await prisma.certificateEvent.findMany({
        where: { certificateId: certificate.id },
        orderBy: { createdAt: "desc" },
        take: 20
      })
    : [];

  return (
    <main className="min-h-screen bg-paper px-4 py-10">
      <section className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-ink/10 bg-white shadow-soft">
        <div className="bg-[#0b1b3d] px-6 py-6 text-white">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white p-2">
                <Image alt="LETW logo" className="h-full w-full object-contain" height={96} src="/letw-logo.png" width={96} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d4af37]">Light Encounter Tabernacle Worldwide</p>
                <h1 className="mt-2 text-2xl font-semibold">Certificate Verification</h1>
              </div>
            </div>
            <Badge className={valid ? "border-white/20 bg-white/10 text-white" : "bg-clay text-white"}>
              {valid ? "verified active" : statusLabel}
            </Badge>
          </div>
        </div>

        <div className="p-6">
          {certificate ? (
            <div className="grid gap-5 lg:grid-cols-[1fr_15rem]">
              <div>
                <div className="flex items-start gap-3">
                  {valid ? <ShieldCheck className="mt-1 h-6 w-6 text-moss" /> : <ShieldAlert className="mt-1 h-6 w-6 text-clay" />}
                  <div>
                    <p className="text-sm font-semibold text-ink">{certificate.title}</p>
                    <p className="mt-1 text-sm text-ink/60">
                      {valid
                        ? "This certificate is currently active and verified by LETW."
                        : "This certificate is revoked, expired, inactive, or replaced and should not be accepted."}
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md bg-paper p-3">
                    <p className="text-xs uppercase tracking-wide text-ink/45">Certificate holder</p>
                    <p className="mt-1 font-semibold text-ink">{valid ? holderName : "Hidden for inactive certificate"}</p>
                  </div>
                  <div className="rounded-md bg-paper p-3">
                    <p className="text-xs uppercase tracking-wide text-ink/45">{isMarriage ? "Certificate type" : certificate.certificateCategory === "EDUCATION" ? "Candidate register" : "Member number"}</p>
                    <p className="mt-1 font-semibold text-ink">{valid ? (isMarriage ? "Marriage register" : holderNumber) : "Hidden"}</p>
                    {valid && presetDisplay ? <p className="mt-1 text-xs text-ink/55">{presetDisplay.label}</p> : null}
                  </div>
                  <div className="rounded-md bg-paper p-3">
                    <p className="text-xs uppercase tracking-wide text-ink/45">{certificate.certificateCategory === "EDUCATION" ? "Program / level" : "Position"}</p>
                    <p className="mt-1 font-semibold text-ink">{valid ? holderPosition : "Hidden"}</p>
                  </div>
                  <div className="rounded-md bg-paper p-3">
                    <p className="text-xs uppercase tracking-wide text-ink/45">Certificate number</p>
                    <p className="mt-1 font-semibold text-ink">{certificate.certificateNumber ?? "Pending"}</p>
                  </div>
                  {certificate.certificateCategory === "EDUCATION" ? (
                    <>
                      <div className="rounded-md bg-paper p-3">
                        <p className="text-xs uppercase tracking-wide text-ink/45">Seal number</p>
                        <p className="mt-1 font-semibold text-ink">{certificate.sealNumber ?? "Pending"}</p>
                      </div>
                      <div className="rounded-md bg-paper p-3">
                        <p className="text-xs uppercase tracking-wide text-ink/45">Credential hash</p>
                        <p className="mt-1 break-all font-semibold text-ink">{valid ? certificate.credentialHash?.slice(0, 24).toUpperCase() ?? "Pending" : "Hidden"}</p>
                      </div>
                    </>
                  ) : null}
                  {isMarriage ? (
                    <>
                      <div className="rounded-md bg-paper p-3">
                        <p className="text-xs uppercase tracking-wide text-ink/45">Marriage date</p>
                        <p className="mt-1 font-semibold text-ink">{certificate.marriageDate ? formatDate(certificate.marriageDate) : "Pending"}</p>
                      </div>
                      <div className="rounded-md bg-paper p-3">
                        <p className="text-xs uppercase tracking-wide text-ink/45">Location</p>
                        <p className="mt-1 font-semibold text-ink">{certificate.marriageLocation ?? "LETW"}</p>
                      </div>
                      <div className="rounded-md bg-paper p-3">
                        <p className="text-xs uppercase tracking-wide text-ink/45">Officiant</p>
                        <p className="mt-1 font-semibold text-ink">{certificate.officiantName ?? "LETW Minister"}</p>
                      </div>
                      <div className="rounded-md bg-paper p-3">
                        <p className="text-xs uppercase tracking-wide text-ink/45">Seal number</p>
                        <p className="mt-1 font-semibold text-ink">{certificate.sealNumber ?? "Pending"}</p>
                      </div>
                    </>
                  ) : null}
                  <div className="rounded-md bg-paper p-3">
                    <p className="text-xs uppercase tracking-wide text-ink/45">Issued</p>
                    <p className="mt-1 font-semibold text-ink">{formatDate(certificate.issuedAt)}</p>
                  </div>
                  <div className="rounded-md bg-paper p-3">
                    <p className="text-xs uppercase tracking-wide text-ink/45">Expires</p>
                    <p className="mt-1 font-semibold text-ink">{certificate.expiresAt ? formatDate(certificate.expiresAt) : "No expiry"}</p>
                  </div>
                  {certificate.replacementOfId ? (
                    <div className="rounded-md bg-paper p-3">
                      <p className="text-xs uppercase tracking-wide text-ink/45">Replacement of</p>
                      <p className="mt-1 break-all font-semibold text-ink">{certificate.replacementOfId}</p>
                    </div>
                  ) : null}
                  {certificate.replacedById ? (
                    <div className="rounded-md bg-paper p-3">
                      <p className="text-xs uppercase tracking-wide text-ink/45">Replaced by</p>
                      <p className="mt-1 break-all font-semibold text-ink">{certificate.replacedById}</p>
                    </div>
                  ) : null}
                </div>

                <div className="mt-6 rounded-lg border border-ink/10 bg-white p-4">
                  <p className="text-sm font-semibold text-ink">Verification timeline</p>
                  <div className="mt-3 space-y-3">
                    {timeline.length ? timeline.map((event) => (
                      <div className="rounded-md border border-ink/10 bg-paper px-3 py-2" key={event.id}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0b1b3d]">{event.eventType.replaceAll("_", " ")}</p>
                          <p className="text-xs text-ink/55">{formatDate(event.createdAt)}</p>
                        </div>
                        {event.summary ? <p className="mt-1 text-sm text-ink/65">{event.summary}</p> : null}
                      </div>
                    )) : <p className="text-sm text-ink/55">No certificate timeline has been recorded yet.</p>}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-[#d4af37]/40 bg-[#fffaf0] p-4 text-center">
                {valid && photoSrc ? (
                  <div className="mx-auto mb-4 flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-4 border-[#d4af37] bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      alt={`${holderName} profile`}
                      className="h-full w-full object-cover"
                      src={photoSrc}
                    />
                  </div>
                ) : null}
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-[#d4af37]/60 bg-white p-2">
                  <Image alt="LETW official seal" className="h-full w-full object-contain" height={96} src="/letw-logo.png" width={96} />
                </div>
                <p className="mt-3 text-sm font-semibold text-[#0b1b3d]">LETW official seal</p>
                <p className="mt-2 text-xs leading-5 text-ink/55">
                  Confirm the status on this page before accepting a printed or digital certificate.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-md bg-clay/10 p-5 text-sm text-clay">This certificate verification code was not found.</div>
          )}

          <Link className="mt-6 inline-flex h-10 items-center rounded-md bg-moss px-4 text-sm font-medium text-white" href="https://letw.org">
            Visit letw.org
          </Link>
        </div>
      </section>
    </main>
  );
}
