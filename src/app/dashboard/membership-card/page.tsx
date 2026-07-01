/* eslint-disable @next/next/no-img-element */
import { BadgeCheck, Building2, CalendarDays, Download, KeyRound, QrCode, ShieldCheck, WalletCards } from "lucide-react";
import Image from "next/image";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PrintIdButton } from "@/components/dashboard/print-id-button";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { cardStatusTone, refreshOfflinePayload } from "@/lib/qr-identity";
import { ensureMembershipCredential, verifyMembershipCredential } from "@/lib/verifiable-credentials";

function DetailRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="plastic-id-detail-row">
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

  const location =
    account?.memberProfile?.digitalIdLocation ||
    [account?.memberProfile?.city, account?.memberProfile?.country].filter(Boolean).join(", ") ||
    "LETTW Worldwide";
  const position = account?.memberProfile?.organizationPosition ?? "Member";
  const membershipNumber = account?.memberProfile?.membershipNumber || card?.cardNumber || "";
  const memberSince = String(
    account?.memberProfile?.membershipStartedAt?.getFullYear() ?? card?.issuedAt.getFullYear() ?? new Date().getFullYear()
  );
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
                <Image
                  alt="LETTW logo"
                  className="h-14 w-14 rounded-md bg-white object-contain p-1"
                  height={112}
                  src="/letw-logo.png"
                  width={112}
                  priority
                />
                <div>
                  <p>Light Encounter Tabernacle Worldwide</p>
                  <span>Official Membership Identity</span>
                </div>
              </header>

              <div className="plastic-id-front-body">
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

                <div className="plastic-id-details">
                  <DetailRow label="Organization ID" value={card.organizationId} mono />
                  <DetailRow label="Member no." value={membershipNumber} mono />
                  <DetailRow label="Member since" value={memberSince} />
                  <DetailRow label="Location" value={location} />
                </div>
              </div>

              <footer className="plastic-id-portrait-footer">
                <span>letw.org</span>
                <Badge className={cardValid ? "bg-amber-300 text-[#0b1f33]" : "bg-red-100 text-red-800"}>
                  {cardDisplayStatus}
                </Badge>
              </footer>
            </section>

            <section className="plastic-id-card plastic-id-card-back">
              <header className="plastic-id-back-header">
                <div>
                  <p>Identity Verification</p>
                  <span>Scan to confirm current membership status</span>
                </div>
                <QrCode className="h-7 w-7 text-amber-300" />
              </header>

              <div className="plastic-id-back-body">
                <div className="plastic-id-terms">
                  <p>This card remains the property of Light Encounter Tabernacle Worldwide.</p>
                  <p>It is valid only while the QR confirmation page displays “confirmed”.</p>
                  <p>Revoked, expired, deleted, or replaced credentials must not be accepted.</p>
                </div>

                <div className="plastic-id-large-qr">
                  {cardValid ? (
                    <img alt="Scan to verify LETTW membership" src="/api/membership-card/qr" />
                  ) : (
                    <ShieldCheck className="h-14 w-14 text-red-700" />
                  )}
                </div>
                <p className="plastic-id-scan-label">SCAN TO AUTHENTICATE</p>
                <p className="plastic-id-back-org-id">{card.organizationId}</p>
                {card.offlinePayloadHash ? (
                  <p className="mt-1 max-w-full truncate font-mono text-[9px] text-white/65">
                    Offline hash {card.offlinePayloadHash.slice(0, 18)}
                  </p>
                ) : null}

                <div className="plastic-id-validity">
                  <span>
                    <CalendarDays className="h-3 w-3" />
                    Issued {card.issuedAt.toLocaleDateString()}
                  </span>
                  <span>{card.expiresAt ? `Expires ${card.expiresAt.toLocaleDateString()}` : "No expiry"}</span>
                </div>
              </div>

              <footer className="plastic-id-back-footer">
                LIGHT ENCOUNTER TABERNACLE WORLDWIDE | letw.org
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
