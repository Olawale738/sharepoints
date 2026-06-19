import { createHash } from "node:crypto";

import { BadgeCheck, Ban, Building2, CalendarDays, ShieldCheck } from "lucide-react";
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
    prisma.digitalMembershipCard.findUnique({ where: { qrToken: token } }),
    auth(),
    headers()
  ]);
  const valid = Boolean(card && card.status === "ACTIVE" && (!card.expiresAt || card.expiresAt > new Date()));
  const account = card
    ? await prisma.user.findUnique({
        where: { id: card.userId },
        select: {
          id: true,
          name: true,
          image: true,
          memberProfile: { select: { membershipNumber: true, membershipStatus: true } },
          workspaceMemberships: {
            where: { workspace: { deletedAt: null } },
            select: { role: true, workspace: { select: { name: true } } },
            take: 8
          }
        }
      })
    : null;
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
  const photoUrl = account?.image?.startsWith("/api/profile/photo/")
    ? `/api/profile/photo/${account.id}?token=${token}`
    : account?.image;

  return (
    <main className="min-h-screen bg-paper px-4 py-8 text-ink sm:py-14">
      <section className="mx-auto max-w-2xl overflow-hidden rounded-lg border border-ink/10 bg-white shadow-soft">
        <header className="flex items-center justify-between gap-4 border-b border-ink/10 bg-paper p-5">
          <div className="flex items-center gap-3">
            <Image alt="LETW logo" className="h-12 w-12 rounded-md border border-ink/10 bg-white object-contain" height={96} src="/letw-logo.png" width={96} priority />
            <div><p className="font-semibold">LETW.ORG</p><p className="text-xs text-ink/50">Digital Identity Verification</p></div>
          </div>
          <Badge className={valid ? "bg-mint text-moss" : "bg-clay/10 text-clay"}>{valid ? "verified" : "not valid"}</Badge>
        </header>

        {valid && card && account ? (
          <div className="p-6">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border border-ink/10 bg-paper">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {photoUrl ? <img alt={`${account.name ?? "Member"} profile`} className="h-full w-full object-cover" src={photoUrl} /> : <ShieldCheck className="h-10 w-10 text-moss" />}
              </div>
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-sm font-semibold text-moss"><BadgeCheck className="h-4 w-4" />Authentic LETW.ORG member</p>
                <h1 className="mt-2 text-3xl font-semibold">{account.name ?? "LETW Member"}</h1>
                <p className="mt-1 text-sm text-ink/55">Organization: LETW.ORG</p>
              </div>
            </div>
            <dl className="mt-6 grid gap-4 rounded-md border border-ink/10 bg-paper p-4 sm:grid-cols-2">
              <div><dt className="text-xs text-ink/45">Organization ID</dt><dd className="mt-1 font-semibold">{card.organizationId}</dd></div>
              <div><dt className="text-xs text-ink/45">Digital card number</dt><dd className="mt-1 font-semibold">{card.cardNumber}</dd></div>
              <div><dt className="text-xs text-ink/45">Membership number</dt><dd className="mt-1 font-semibold">{account.memberProfile?.membershipNumber ?? "Pending"}</dd></div>
              <div><dt className="text-xs text-ink/45">Membership status</dt><dd className="mt-1 font-semibold">{account.memberProfile?.membershipStatus?.toLowerCase() ?? "active"}</dd></div>
              <div><dt className="text-xs text-ink/45">Issued</dt><dd className="mt-1 flex items-center gap-2 font-semibold"><CalendarDays className="h-4 w-4 text-moss" />{card.issuedAt.toLocaleDateString()}</dd></div>
              <div><dt className="text-xs text-ink/45">Expires</dt><dd className="mt-1 font-semibold">{card.expiresAt ? card.expiresAt.toLocaleDateString() : "No expiry"}</dd></div>
            </dl>
            <div className="mt-5">
              <p className="flex items-center gap-2 text-sm font-semibold"><Building2 className="h-4 w-4 text-moss" />LETW participation</p>
              <div className="mt-2 flex flex-wrap gap-2">{account.workspaceMemberships.map((membership) => <Badge key={`${membership.workspace.name}-${membership.role}`}>{membership.workspace.name}: {membership.role.toLowerCase()}</Badge>)}</div>
            </div>
          </div>
        ) : (
          <div className="p-8 text-center">
            <Ban className="mx-auto h-12 w-12 text-clay" />
            <h1 className="mt-4 text-2xl font-semibold">This LETW.ORG identity is not valid</h1>
            <p className="mt-2 text-sm text-ink/60">The ID was not found, has expired, is suspended, or was revoked by an administrator. Do not accept it as proof of active membership.</p>
            {card ? <p className="mt-4 rounded-md bg-paper px-3 py-2 text-sm">Organization ID: {card.organizationId}</p> : null}
          </div>
        )}
        <footer className="border-t border-ink/10 bg-paper px-5 py-4 text-center text-xs text-ink/45">
          Verification result recorded by LETW.ORG. <Link className="font-medium text-moss" href="/login">Member sign in</Link>
        </footer>
      </section>
    </main>
  );
}
