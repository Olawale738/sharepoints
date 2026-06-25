/* eslint-disable @next/next/no-img-element */
import { BadgeCheck, Building2, CalendarDays, QrCode, ShieldCheck } from "lucide-react";
import Image from "next/image";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PrintIdButton } from "@/components/dashboard/print-id-button";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";

export default async function MembershipCardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [card, account, memberships] = await Promise.all([
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
    })
  ]);

  const location =
    account?.memberProfile?.digitalIdLocation ||
    [account?.memberProfile?.city, account?.memberProfile?.country].filter(Boolean).join(", ") ||
    "LETTW Worldwide";
  const position = account?.memberProfile?.organizationPosition ?? "Member";

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <p className="flex items-center gap-2 text-sm font-medium text-moss">
          <BadgeCheck className="h-4 w-4" />
          Verified LETTW identity
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Digital Membership Card</h1>
        <p className="mt-2 text-sm text-ink/60">
          A printable plastic-format identity for Light Encounter Tabernacle Worldwide (LETTW), with secure QR
          authentication through LETW.ORG.
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
        <div className="digital-id-print-sheet mx-auto space-y-5">
          <section
            className={`plastic-id-card plastic-id-card-front ${
              card.status !== "ACTIVE" ? "plastic-id-card-invalid" : ""
            }`}
          >
            <div className="plastic-id-brand">
              <div className="flex min-w-0 items-center gap-2">
                <Image
                  alt="LETTW logo"
                  className="h-10 w-10 shrink-0 rounded-md bg-white object-contain"
                  height={80}
                  src="/letw-logo.png"
                  width={80}
                  priority
                />
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-semibold uppercase text-white">
                    Light Encounter Tabernacle Worldwide
                  </p>
                  <p className="text-[8px] text-white/65">LETTW | LETW.ORG</p>
                </div>
              </div>
              <Badge className={card.status === "ACTIVE" ? "bg-amber-300 text-[#0b1f33]" : "bg-clay/90 text-white"}>
                {card.status.toLowerCase()}
              </Badge>
            </div>

            <div className="plastic-id-content">
              <div className="plastic-id-photo">
                {account?.image ? (
                  <img
                    alt={`${account.name ?? "Member"} profile`}
                    className="h-full w-full object-cover"
                    src={account.image}
                  />
                ) : (
                  <ShieldCheck className="h-9 w-9 text-amber-300" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[8px] font-medium uppercase text-white/60">Member name</p>
                <h2 className="truncate text-lg font-semibold leading-tight text-white">
                  {account?.name ?? "LETTW Member"}
                </h2>
                <p className="mt-2 text-[8px] font-medium uppercase text-white/60">Organization ID</p>
                <p className="truncate font-mono text-[11px] font-semibold text-amber-300">{card.organizationId}</p>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-white">
                  <div>
                    <p className="text-[7px] uppercase text-white/50">Member no.</p>
                    <p className="truncate text-[9px] font-medium">
                      {account?.memberProfile?.membershipNumber ?? "Pending"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[7px] uppercase text-white/50">Member since</p>
                    <p className="truncate text-[9px] font-medium">
                      {account?.memberProfile?.membershipStartedAt?.getFullYear() ?? card.issuedAt.getFullYear()}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[7px] uppercase text-white/50">Position</p>
                    <p className="truncate text-[9px] font-medium">{position}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[7px] uppercase text-white/50">Location</p>
                    <p className="truncate text-[9px] font-medium">{location}</p>
                  </div>
                </div>
              </div>
              <div className="plastic-id-qr">
                <img alt="Secure LETTW membership QR code" className="h-full w-full" src="/api/membership-card/qr" />
              </div>
            </div>

            <div className="plastic-id-footer">
              <span>{card.cardNumber}</span>
              <span>{card.expiresAt ? `Valid to ${card.expiresAt.toLocaleDateString()}` : "No expiry"}</span>
            </div>
          </section>

          <section className="plastic-id-card plastic-id-card-back">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold text-amber-300">LETTW DIGITAL ID</p>
                <p className="mt-1 max-w-[15rem] text-[8px] leading-4 text-white/65">
                  This card identifies an authorized member of Light Encounter Tabernacle Worldwide. Scan the QR
                  code to confirm its current status.
                </p>
              </div>
              <ShieldCheck className="h-7 w-7 text-amber-300" />
            </div>
            <div className="mt-4 grid grid-cols-[5.25rem_minmax(0,1fr)] gap-4">
              <div className="rounded-md border border-white/20 bg-white p-1">
                <img alt="LETTW identity verification QR" className="h-full w-full" src="/api/membership-card/qr" />
              </div>
              <div className="space-y-2 text-white">
                <p className="flex items-center gap-2 text-[9px] font-semibold">
                  <QrCode className="h-3.5 w-3.5 text-amber-300" />
                  SCAN TO VERIFY
                </p>
                <p className="font-mono text-[10px] font-semibold text-amber-300">{card.organizationId}</p>
                <p className="text-[8px] font-medium">{position}</p>
                <p className="text-[8px] text-white/65">{location}</p>
                <p className="flex items-center gap-2 text-[8px] text-white/55">
                  <CalendarDays className="h-3 w-3" />
                  Issued {card.issuedAt.toLocaleDateString()}
                </p>
                <p className="text-[8px] leading-4 text-white/55">
                  If found, return to LETTW administration. This card remains the property of Light Encounter
                  Tabernacle Worldwide.
                </p>
              </div>
            </div>
            <div className="plastic-id-back-footer">LETW.ORG | SECURE MEMBER IDENTITY</div>
          </section>

          <section className="rounded-lg border border-ink/10 bg-white p-4 print:hidden">
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
        </div>
      )}
    </div>
  );
}
