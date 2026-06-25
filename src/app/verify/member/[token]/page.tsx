/* eslint-disable @next/next/no-img-element */
import { createHash } from "node:crypto";

import { BadgeCheck, Ban, Building2, CalendarDays, MapPin, ShieldCheck, UserRoundCheck } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";

import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Verify LETW.ORG Digital ID",
  robots: { index: false, follow: false }
};

export default async function VerifyMemberPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [card, session, requestHeaders] = await Promise.all([
    prisma.digitalMembershipCard.findFirst({ where: { qrToken: token, deletedAt: null } }),
    auth(),
    headers()
  ]);
  const account = card
    ? await prisma.user.findUnique({
        where: { id: card.userId },
        select: {
          id: true,
          name: true,
          image: true,
          suspendedAt: true,
          accessRevokedAt: true,
          deletedAt: true,
          memberProfile: {
            select: {
              membershipNumber: true,
              membershipStatus: true,
              membershipStartedAt: true,
              organizationPosition: true,
              digitalIdLocation: true
            }
          }
        }
      })
    : null;
  const valid = Boolean(
    card &&
      card.status === "ACTIVE" &&
      (!card.expiresAt || card.expiresAt > new Date()) &&
      account &&
      !account.suspendedAt &&
      !account.accessRevokedAt &&
      !account.deletedAt
  );
  const forwardedIp = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipHash = createHash("sha256")
    .update(`${process.env.AUTH_SECRET ?? "letw-verification"}:${forwardedIp}`)
    .digest("hex");

  if (card) {
    await prisma.digitalIdentityVerification.create({
      data: {
        cardId: card.id,
        organizationId: card.organizationId,
        outcome: valid ? "VALID" : card.status,
        scannedById: session?.user?.id ?? null,
        ipHash,
        userAgent: requestHeaders.get("user-agent")?.slice(0, 500) ?? null
      }
    });
  }

  const photoUrl =
    valid && account?.image?.startsWith("/api/profile/photo/")
      ? `/api/profile/photo/${account.id}?token=${token}`
      : valid
        ? account?.image
        : null;
  const memberSince = account?.memberProfile?.membershipStartedAt ?? card?.issuedAt;

  return (
    <main className="min-h-screen bg-[#edf1f5] px-4 py-8 text-[#0b1f33] sm:py-14">
      <section className="mx-auto max-w-2xl overflow-hidden rounded-lg border border-[#0b1f33]/15 bg-white shadow-xl">
        <header className="flex items-center justify-between gap-4 bg-[#0b1f33] p-5 text-white">
          <div className="flex items-center gap-3">
            <Image
              alt="LETTW logo"
              className="h-12 w-12 rounded-md bg-white object-contain"
              height={96}
              src="/letw-logo.png"
              width={96}
              priority
            />
            <div>
              <p className="font-semibold">Light Encounter Tabernacle Worldwide</p>
              <p className="text-xs text-white/65">LETTW Digital Identity Authentication</p>
            </div>
          </div>
          <Badge className={valid ? "bg-amber-300 text-[#0b1f33]" : "bg-red-100 text-red-800"}>
            {valid ? "confirmed" : "rejected"}
          </Badge>
        </header>

        {valid && card && account ? (
          <div className="p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border border-[#0b1f33]/15 bg-[#edf1f5]">
                {photoUrl ? (
                  <img alt={`${account.name ?? "Member"} profile`} className="h-full w-full object-cover" src={photoUrl} />
                ) : (
                  <ShieldCheck className="h-10 w-10 text-[#b78727]" />
                )}
              </div>
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                  <BadgeCheck className="h-4 w-4" />
                  QR code authentication confirmed
                </p>
                <h1 className="mt-2 text-3xl font-semibold">{account.name ?? "LETTW Member"}</h1>
                <p className="mt-1 text-sm text-[#0b1f33]/60">Authorized LETTW member identity</p>
              </div>
            </div>

            <dl className="mt-6 grid gap-4 rounded-md border border-[#0b1f33]/10 bg-[#f5f7fa] p-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-[#0b1f33]/50">Organization ID</dt>
                <dd className="mt-1 font-mono font-semibold text-[#9a6b13]">{card.organizationId}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#0b1f33]/50">Member number</dt>
                <dd className="mt-1 font-semibold">{account.memberProfile?.membershipNumber || card.cardNumber}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-xs text-[#0b1f33]/50">
                  <UserRoundCheck className="h-3.5 w-3.5" />
                  Position
                </dt>
                <dd className="mt-1 font-semibold">{account.memberProfile?.organizationPosition ?? "Member"}</dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-xs text-[#0b1f33]/50">
                  <MapPin className="h-3.5 w-3.5" />
                  Location
                </dt>
                <dd className="mt-1 font-semibold">
                  {account.memberProfile?.digitalIdLocation ?? "LETTW Worldwide"}
                </dd>
              </div>
              <div>
                <dt className="flex items-center gap-1 text-xs text-[#0b1f33]/50">
                  <CalendarDays className="h-3.5 w-3.5" />
                  Member since
                </dt>
                <dd className="mt-1 font-semibold">{memberSince?.getFullYear() ?? card.issuedAt.getFullYear()}</dd>
              </div>
              <div>
                <dt className="text-xs text-[#0b1f33]/50">Membership status</dt>
                <dd className="mt-1 font-semibold">
                  {account.memberProfile?.membershipStatus?.toLowerCase() ?? "active"}
                </dd>
              </div>
            </dl>

            <p className="mt-5 flex items-center gap-2 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <Building2 className="h-4 w-4" />
              This credential is currently accepted by Light Encounter Tabernacle Worldwide.
            </p>
          </div>
        ) : (
          <div className="p-8 text-center">
            <Ban className="mx-auto h-12 w-12 text-red-700" />
            <h1 className="mt-4 text-2xl font-semibold">QR code authentication failed</h1>
            <p className="mt-2 text-sm text-[#0b1f33]/60">
              This credential was not found, has expired, was revoked, was deleted, or belongs to an inactive
              account. Do not accept it as proof of active membership.
            </p>
            {card ? (
              <p className="mt-4 rounded-md bg-[#f5f7fa] px-3 py-2 text-sm">
                Organization ID: {card.organizationId}
              </p>
            ) : null}
          </div>
        )}

        <footer className="border-t border-[#0b1f33]/10 bg-[#f5f7fa] px-5 py-4 text-center text-xs text-[#0b1f33]/50">
          Verification result recorded by LETW.ORG.{" "}
          <Link className="font-medium text-[#9a6b13]" href="/login">
            Member sign in
          </Link>
        </footer>
      </section>
    </main>
  );
}
