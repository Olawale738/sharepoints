/* eslint-disable @next/next/no-img-element */

import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  Download,
  Fingerprint,
  Globe2,
  KeyRound,
  Mail,
  Phone,
  ShieldCheck,
  WalletCards
} from "lucide-react";
import Image from "next/image";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PrintIdButton } from "@/components/dashboard/print-id-button";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { cardStatusTone, ensureMemberNumber, refreshOfflinePayload } from "@/lib/qr-identity";
import { ensureMembershipCredential, verifyMembershipCredential } from "@/lib/verifiable-credentials";

function IdentityMetric({
  label,
  value,
  mono = false
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="plastic-id-metric">
      <span>{label}</span>
      <strong className={mono ? "font-mono" : ""}>{value}</strong>
    </div>
  );
}

export default async function MembershipCardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [card, account, memberships, badges, onboarding, household] = await Promise.all([
    prisma.digitalMembershipCard.findFirst({
      where: { userId: session.user.id, deletedAt: null }
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        email: true,
        image: true,
        memberProfile: {
          select: {
            membershipNumber: true,
            membershipStatus: true,
            city: true,
            country: true,
            membershipStartedAt: true,
            organizationPosition: true,
            digitalIdLocation: true
          }
        }
      }
    }),
    prisma.workspaceMember.findMany({
      where: { userId: session.user.id, workspace: { deletedAt: null } },
      select: { role: true, workspace: { select: { name: true } } },
      orderBy: { joinedAt: "asc" }
    }),
    prisma.memberCertificationBadge.findMany({
      where: { userId: session.user.id, status: "ACTIVE", OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
      orderBy: { issuedAt: "desc" },
      take: 12
    }),
    prisma.memberOnboardingItem.findMany({
      where: { userId: session.user.id },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }],
      take: 20
    }),
    prisma.membershipHouseholdLink.findMany({
      where: { OR: [{ primaryUserId: session.user.id }, { relatedUserId: session.user.id }] },
      orderBy: { createdAt: "desc" },
      take: 20
    })
  ]);
  let credentialVerification: Awaited<ReturnType<typeof verifyMembershipCredential>> | null = null;
  let credentialError: string | null = null;

  if (card) {
    try {
      const signedCredential = await ensureMembershipCredential(card.id);
      await refreshOfflinePayload(card.id).catch(() => null);
      credentialVerification = await verifyMembershipCredential(signedCredential.card);
    } catch (error) {
      credentialError =
        error instanceof Error
          ? error.message
          : "The signed credential could not be prepared.";
    }
  }

  const ensuredMembershipNumber =
    account?.memberProfile?.membershipNumber ||
    (await ensureMemberNumber(session.user.id).catch(() => null)) ||
    card?.cardNumber ||
    "";
  const location =
    account?.memberProfile?.digitalIdLocation ||
    [account?.memberProfile?.city, account?.memberProfile?.country].filter(Boolean).join(", ") ||
    "LETTW Worldwide";
  const position = account?.memberProfile?.organizationPosition ?? "Member";
  const membershipNumber = ensuredMembershipNumber;
  const memberSince = String(
    account?.memberProfile?.membershipStartedAt?.getFullYear() ?? card?.issuedAt.getFullYear() ?? new Date().getFullYear()
  );
  const issuedLabel = card?.issuedAt.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
  const validityLabel = card?.expiresAt
    ? card.expiresAt.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })
    : "No Expiry";
  const cardValid = Boolean(
    card && card.status === "ACTIVE" && (!card.expiresAt || card.expiresAt > new Date())
  );
  const cardDisplayStatus = !card
    ? "not issued"
    : cardValid
      ? "active"
      : card.status === "ACTIVE"
        ? "expired"
        : card.status.toLowerCase();
  const cardDisplayStatusLabel = cardDisplayStatus
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
  const statusTone = card ? cardStatusTone(card) : "MISSING";

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <p className="flex items-center gap-2 text-sm font-medium text-moss">
          <BadgeCheck className="h-4 w-4" />
          Verified LETTW identity
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Digital Membership Card</h1>
        <p className="mt-2 text-sm text-ink/60">
          A portrait, two-sided plastic membership identity for Light Encounter Tabernacle Worldwide, with
          high-contrast QR authentication.
        </p>
        <div className="mt-4">
          <PrintIdButton />
        </div>
      </section>

      {!card ? (
        <section className="rounded-lg border border-ink/10 bg-white p-8 text-center">
          <BadgeCheck className="mx-auto h-8 w-8 text-ink/35" />
          <h2 className="mt-3 font-semibold">Your card has not been issued yet</h2>
          <p className="mt-1 text-sm text-ink/55">
            An administrator can issue your digital card from the Global Church Network.
          </p>
        </section>
      ) : (
        <>
          <div className="digital-id-print-sheet mx-auto">
            <section
              className={`plastic-id-card plastic-id-card-front ${
                !cardValid ? "plastic-id-card-invalid" : ""
              }`}
            >
              <header className="plastic-id-portrait-header">
                <div className="plastic-id-brand-mark">
                  <Image
                    alt="LETTW logo"
                    className="plastic-id-brand-logo"
                    height={112}
                    src="/letw-logo-transparent.png"
                    width={112}
                    priority
                  />
                </div>
                <div className="plastic-id-brand-copy">
                  <p>Light Encounter Tabernacle Worldwide</p>
                </div>
              </header>

              <div className="plastic-id-front-body">
                <span className="plastic-id-map-watermark" aria-hidden="true" />
                <div className="plastic-id-portrait-photo">
                  {account?.image ? (
                    <img
                      alt={`${account.name ?? "Member"} profile`}
                      className="h-full w-full object-cover"
                      src={account.image}
                    />
                  ) : (
                    <ShieldCheck className="h-12 w-12 text-[#b78727]" />
                  )}
                </div>

                <p className="plastic-id-member-name">{account?.name ?? "LETTW Member"}</p>
                <p className="plastic-id-position">{position}</p>
                {badges.length ? (
                  <p className="mt-1 text-center text-[10px] font-semibold uppercase tracking-wide text-[#b78727]">
                    {badges.slice(0, 2).map((badge) => badge.title).join(" | ")}
                  </p>
                ) : null}

                <div className="plastic-id-info-grid">
                  <IdentityMetric label="Organization ID" value={card.organizationId} mono />
                  <IdentityMetric label="Member Number" value={membershipNumber} mono />
                  <IdentityMetric label="Member Since" value={memberSince} />
                  <IdentityMetric label="Location" value={location} />
                </div>
              </div>

              <footer className="plastic-id-portrait-footer">
                <div className="plastic-id-security-strip" />
                <div className="plastic-id-footer-main">
                  <div className="plastic-id-active-badge">
                    <ShieldCheck className="h-4 w-4" />
                    <strong>{cardDisplayStatusLabel}</strong>
                  </div>
                  <div className="plastic-id-date-pair">
                    <span>Issued:</span>
                    <strong>{issuedLabel}</strong>
                  </div>
                  <div className="plastic-id-date-pair">
                    <span>Validity:</span>
                    <strong>{validityLabel}</strong>
                  </div>
                </div>
                <div className="plastic-id-signature">
                  <span />
                  <small>Authorized Signature</small>
                </div>
              </footer>
            </section>

            <section className="plastic-id-card plastic-id-card-back">
              <header className="plastic-id-back-header">
                <div>
                  <p>Identity Verification</p>
                  <span>Scan to verify official membership credentials.</span>
                </div>
              </header>

              <div className="plastic-id-back-body">
                <Image
                  alt=""
                  aria-hidden="true"
                  className="plastic-id-watermark"
                  height={420}
                  src="/letw-logo-transparent.png"
                  width={420}
                />
                <div className="plastic-id-large-qr">
                  {cardValid ? (
                    <img alt="Scan to verify LETTW membership" src="/api/membership-card/qr" />
                  ) : (
                    <ShieldCheck className="h-14 w-14 text-red-700" />
                  )}
                </div>
                <p className="plastic-id-scan-label">Scan to Authenticate</p>
                <p className="plastic-id-back-org-id">{card.organizationId}</p>

                <div className="plastic-id-security-icons">
                  <span><CheckCircle2 className="h-3.5 w-3.5" /> Secure</span>
                  <span><ShieldCheck className="h-3.5 w-3.5" /> Verified</span>
                </div>

                <div className="plastic-id-terms">
                  <h3>Verification Notice</h3>
                  <p>This credential remains the property of Light Encounter Tabernacle Worldwide.</p>
                  <p>Authentication is valid only when the QR verification portal displays VERIFIED status.</p>
                  <p>Revoked, expired, suspended, replaced, altered, or deleted credentials are invalid.</p>
                  <p>This credential is non-transferable.</p>
                </div>

                <div className="plastic-id-contact-grid">
                  <span><Globe2 className="h-3.5 w-3.5" /> www.letw.org</span>
                  <span><Mail className="h-3.5 w-3.5" /> info@letw.org</span>
                  <span><Phone className="h-3.5 w-3.5" /> +234 XXX XXX XXXX</span>
                </div>

                <div className="plastic-id-hologram-seal" aria-hidden="true">
                  <Image
                    alt=""
                    height={112}
                    src="/letw-logo-transparent.png"
                    width={112}
                  />
                  <Fingerprint className="h-5 w-5" />
                </div>

              </div>

              <footer className="plastic-id-back-footer">
                <p>Light Encounter Tabernacle Worldwide</p>
                <strong>Empowering Lives | Transforming Nations | Advancing God&apos;s Kingdom</strong>
              </footer>
            </section>
          </div>

          <section className="mx-auto max-w-3xl rounded-lg border border-ink/10 bg-white p-4 print:hidden">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <KeyRound className="h-4 w-4 text-moss" />
                  Cryptographically verifiable credential
                </p>
                <p className="mt-1 text-xs text-ink/50">
                  {credentialError
                    ? "The card is loaded, but signed credential verification is temporarily unavailable."
                    : credentialVerification?.signatureValid
                      ? "Ed25519 signature verified. The credential can be independently checked with LETW's public key."
                      : "The signed credential could not be verified."}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Badge className={credentialVerification?.signatureValid ? "bg-mint text-moss" : "bg-clay/10 text-clay"}>
                    signature {credentialError ? "unavailable" : credentialVerification?.signatureValid ? "verified" : "invalid"}
                  </Badge>
                  <Badge className={credentialVerification?.statusValid ? "bg-mint text-moss" : "bg-clay/10 text-clay"}>
                    live status {credentialError ? "unavailable" : credentialVerification?.statusValid ? "valid" : "inactive"}
                  </Badge>
                  <Badge className={statusTone === "ACTIVE" ? "bg-mint text-moss" : "bg-clay/10 text-clay"}>
                    card {statusTone.toLowerCase()}
                  </Badge>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {credentialError ? (
                  <span className="inline-flex h-10 items-center gap-2 rounded-md border border-ink/10 bg-paper px-3 text-sm font-medium text-ink/45">
                    <Download className="h-4 w-4" />
                    Signed credential unavailable
                  </span>
                ) : (
                  <a
                    className="inline-flex h-10 items-center gap-2 rounded-md border border-ink/10 bg-white px-3 text-sm font-medium hover:bg-mint/40"
                    href={`/api/credentials/member/${card.qrToken}`}
                  >
                    <Download className="h-4 w-4" />
                    Download signed credential
                  </a>
                )}
                <a
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-ink/10 bg-white px-3 text-sm font-medium hover:bg-mint/40"
                  href="/api/credentials/jwks"
                  target="_blank"
                  rel="noreferrer"
                >
                  <KeyRound className="h-4 w-4" />
                  Public verification keys
                </a>
                <a
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-ink/10 bg-white px-3 text-sm font-medium hover:bg-mint/40"
                  href="/api/membership-card/wallet"
                  target="_blank"
                  rel="noreferrer"
                >
                  <WalletCards className="h-4 w-4" />
                  Wallet payload
                </a>
              </div>
            </div>
          </section>

          <section className="mx-auto grid max-w-3xl gap-4 print:hidden md:grid-cols-3">
            <div className="rounded-lg border border-ink/10 bg-white p-4">
              <p className="text-sm font-semibold">Worker badges</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {badges.length ? badges.map((badge) => <Badge key={badge.id}>{badge.title}</Badge>) : <span className="text-xs text-ink/50">No active badges yet.</span>}
              </div>
            </div>
            <div className="rounded-lg border border-ink/10 bg-white p-4">
              <p className="text-sm font-semibold">Onboarding</p>
              <p className="mt-2 text-2xl font-semibold">{onboarding.filter((item) => item.status === "COMPLETED").length}/{onboarding.length}</p>
              <p className="text-xs text-ink/50">completed checklist items</p>
            </div>
            <div className="rounded-lg border border-ink/10 bg-white p-4">
              <p className="text-sm font-semibold">Family / household</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {household.length ? household.map((link) => <Badge key={link.id} className="bg-mint text-moss">{link.relationship}: {link.displayName}</Badge>) : <span className="text-xs text-ink/50">No household links yet.</span>}
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-3xl rounded-lg border border-ink/10 bg-white p-4 print:hidden">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Building2 className="h-4 w-4 text-moss" />
              Authorized workspaces and roles
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {memberships.map((membership) => (
                <Badge key={`${membership.workspace.name}-${membership.role}`}>
                  {membership.workspace.name}: {membership.role.toLowerCase()}
                </Badge>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
