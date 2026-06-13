import Image from "next/image";
import { BadgeCheck, Building2, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";

export default async function MembershipCardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const [card, account, memberships] = await Promise.all([
    prisma.digitalMembershipCard.findUnique({ where: { userId: session.user.id } }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        email: true,
        image: true,
        memberProfile: { select: { membershipNumber: true, membershipStatus: true } }
      }
    }),
    prisma.workspaceMember.findMany({
      where: { userId: session.user.id, workspace: { deletedAt: null } },
      select: { role: true, workspace: { select: { name: true } } },
      orderBy: { joinedAt: "asc" }
    })
  ]);

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <p className="flex items-center gap-2 text-sm font-medium text-moss"><BadgeCheck className="h-4 w-4" />Verified LETW identity</p>
        <h1 className="mt-2 text-3xl font-semibold">Digital Membership Card</h1>
        <p className="mt-2 text-sm text-ink/60">Use this secure QR identity for LETW events, attendance, certificates, branch transfers, volunteer duty, and access checks.</p>
      </section>

      {!card ? (
        <section className="rounded-lg border border-ink/10 bg-white p-8 text-center">
          <BadgeCheck className="mx-auto h-8 w-8 text-ink/35" />
          <h2 className="mt-3 font-semibold">Your card has not been issued yet</h2>
          <p className="mt-1 text-sm text-ink/55">An administrator can issue your digital card from the Global Church Network.</p>
        </section>
      ) : (
        <section className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-ink/10 bg-white shadow-soft">
          <div className="flex flex-col gap-6 border-b border-ink/10 bg-paper p-6 md:flex-row md:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-ink/10 bg-white">
                {account?.image ? <Image alt="" className="h-full w-full object-cover" height={160} src={account.image} width={160} /> : <ShieldCheck className="h-9 w-9 text-moss" />}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-moss">Light Encounter Tabernacle Worldwide</p>
                <h2 className="mt-1 truncate text-2xl font-semibold">{account?.name ?? "LETW Member"}</h2>
                <p className="truncate text-sm text-ink/55">{account?.email}</p>
              </div>
            </div>
            <div className="flex h-40 w-40 shrink-0 items-center justify-center rounded-md border border-ink/10 bg-white p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="Secure LETW membership QR code" className="h-full w-full" src="/api/membership-card/qr" />
            </div>
          </div>
          <div className="grid gap-4 p-6 sm:grid-cols-2">
            <div><p className="text-xs text-ink/45">Card number</p><p className="mt-1 font-semibold">{card.cardNumber}</p></div>
            <div><p className="text-xs text-ink/45">Membership number</p><p className="mt-1 font-semibold">{account?.memberProfile?.membershipNumber ?? "Pending"}</p></div>
            <div><p className="text-xs text-ink/45">Status</p><Badge className="mt-1">{card.status.toLowerCase()}</Badge></div>
            <div><p className="text-xs text-ink/45">Expiry</p><p className="mt-1 font-semibold">{card.expiresAt ? card.expiresAt.toLocaleDateString() : "No expiry"}</p></div>
          </div>
          <div className="border-t border-ink/10 p-6">
            <p className="flex items-center gap-2 text-sm font-semibold"><Building2 className="h-4 w-4 text-moss" />Workspace roles</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {memberships.map((membership) => <Badge key={`${membership.workspace.name}-${membership.role}`}>{membership.workspace.name}: {membership.role.toLowerCase()}</Badge>)}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
