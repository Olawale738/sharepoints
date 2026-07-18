import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, CalendarDays, ClipboardCheck, CreditCard, GraduationCap, IdCard, MessageSquareText, ReceiptText, UserRound } from "lucide-react";

import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

export default async function MemberPortalPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [user, receipts, certificates, meetings, assignments] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        department: { select: { name: true } },
        memberProfile: true,
        workspaceMemberships: {
          where: { workspace: { deletedAt: null } },
          select: { role: true, workspace: { select: { id: true, name: true, audienceMode: true } } }
        }
      }
    }),
    prisma.givingReceipt.findMany({
      where: {
        OR: [{ userId: session.user.id }, session.user.email ? { donorEmail: session.user.email.toLowerCase() } : { userId: session.user.id }]
      },
      orderBy: { receivedAt: "desc" },
      take: 8
    }),
    prisma.memberCertificationBadge.findMany({
      where: { userId: session.user.id },
      orderBy: { issuedAt: "desc" },
      take: 8
    }),
    prisma.workspaceMeeting.findMany({
      where: {
        workspace: {
          members: { some: { userId: session.user.id } },
          deletedAt: null
        },
        startsAt: { gte: new Date() }
      },
      select: { id: true, title: true, startsAt: true, meetingType: true, workspaceId: true, workspace: { select: { name: true } } },
      orderBy: { startsAt: "asc" },
      take: 8
    }),
    prisma.memberComplianceAssignment.findMany({
      where: { userId: session.user.id },
      include: { campaign: { select: { title: true, dueAt: true } } },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 8
    })
  ]);

  if (!user) redirect("/login");

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <p className="flex items-center gap-2 text-sm font-medium text-moss"><UserRound className="h-4 w-4" />Member-facing portal</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink">Welcome, {user.name ?? user.email}</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink/60">
          Your LETW profile, digital ID, receipts, certificates, required forms, meetings, and joined workspaces in one private place.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-5">
        <Link className="rounded-lg border border-ink/10 bg-white p-4 transition hover:bg-mint/35" href="/dashboard/profile">
          <UserRound className="h-5 w-5 text-moss" />
          <p className="mt-3 font-semibold">Profile</p>
          <p className="text-sm text-ink/55">{user.memberProfile?.membershipNumber ?? "Member number pending"}</p>
        </Link>
        <Link className="rounded-lg border border-ink/10 bg-white p-4 transition hover:bg-mint/35" href="/dashboard/membership-card">
          <IdCard className="h-5 w-5 text-moss" />
          <p className="mt-3 font-semibold">Digital ID</p>
          <p className="text-sm text-ink/55">QR membership and access card</p>
        </Link>
        <Link className="rounded-lg border border-ink/10 bg-white p-4 transition hover:bg-mint/35" href="/dashboard/student-id">
          <GraduationCap className="h-5 w-5 text-moss" />
          <p className="mt-3 font-semibold">Student ID</p>
          <p className="text-sm text-ink/55">Academic ID, expiry, courses, and certificates</p>
        </Link>
        <Link className="rounded-lg border border-ink/10 bg-white p-4 transition hover:bg-mint/35" href="/dashboard/compliance">
          <ClipboardCheck className="h-5 w-5 text-moss" />
          <p className="mt-3 font-semibold">Required forms</p>
          <p className="text-sm text-ink/55">{assignments.length} recent assignment(s)</p>
        </Link>
        <Link className="rounded-lg border border-ink/10 bg-white p-4 transition hover:bg-mint/35" href="/dashboard/certificates">
          <BadgeCheck className="h-5 w-5 text-moss" />
          <p className="mt-3 font-semibold">Certificates</p>
          <p className="text-sm text-ink/55">{certificates.length} certificate(s)</p>
        </Link>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <section className="rounded-lg border border-ink/10 bg-white">
            <div className="flex items-center gap-2 border-b border-ink/10 px-4 py-3">
              <MessageSquareText className="h-4 w-4 text-moss" />
              <h2 className="text-sm font-semibold">Joined workspaces and chat access</h2>
            </div>
            <div className="divide-y divide-ink/10">
              {user.workspaceMemberships.map((membership) => (
                <Link className="block px-4 py-3 hover:bg-mint/35" href={`/dashboard/workspaces/${membership.workspace.id}`} key={membership.workspace.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-ink">{membership.workspace.name}</p>
                    <Badge>{membership.role.toLowerCase()}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink/50">{membership.workspace.audienceMode.toLowerCase().replaceAll("_", " ")} workspace</p>
                </Link>
              ))}
              {user.workspaceMemberships.length === 0 ? <p className="px-4 py-8 text-sm text-ink/55">You have not joined any workspace yet.</p> : null}
            </div>
          </section>

          <section className="rounded-lg border border-ink/10 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <ReceiptText className="h-4 w-4 text-moss" />
                <h2 className="text-sm font-semibold">Giving receipts</h2>
              </div>
              <Link
                className="inline-flex h-9 items-center rounded-md border border-ink/10 bg-paper px-3 text-xs font-medium"
                href={`/api/giving-receipts/annual-statement?year=${new Date().getUTCFullYear()}`}
              >
                Annual statement
              </Link>
            </div>
            <div className="divide-y divide-ink/10">
              {receipts.map((receipt) => (
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3" key={receipt.id}>
                  <div>
                    <p className="font-medium text-ink">{receipt.fund}</p>
                    <p className="text-xs text-ink/50">{receipt.receiptNumber} - {formatDate(receipt.receivedAt)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>{receipt.status.toLowerCase()}</Badge>
                    <Link className="inline-flex h-9 items-center rounded-md border border-ink/10 bg-paper px-3 text-xs font-medium" href={`/api/giving-receipts/${receipt.id}/pdf`}>
                      Download
                    </Link>
                  </div>
                </div>
              ))}
              {receipts.length === 0 ? <p className="px-4 py-8 text-sm text-ink/55">No giving receipts linked to your account yet.</p> : null}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="rounded-lg border border-ink/10 bg-white">
            <div className="flex items-center gap-2 border-b border-ink/10 px-4 py-3">
              <CalendarDays className="h-4 w-4 text-moss" />
              <h2 className="text-sm font-semibold">Upcoming meetings</h2>
            </div>
            <div className="divide-y divide-ink/10">
              {meetings.map((meeting) => (
                <Link className="block px-4 py-3 hover:bg-mint/35" href={`/dashboard/workspaces/${meeting.workspaceId}`} key={meeting.id}>
                  <p className="font-medium text-ink">{meeting.title}</p>
                  <p className="text-xs text-ink/50">{meeting.workspace.name} - {meeting.meetingType.toLowerCase()} - {formatDate(meeting.startsAt)}</p>
                </Link>
              ))}
              {meetings.length === 0 ? <p className="px-4 py-8 text-sm text-ink/55">No upcoming meetings.</p> : null}
            </div>
          </section>

          <section className="rounded-lg border border-ink/10 bg-white p-4">
            <CreditCard className="h-5 w-5 text-moss" />
            <p className="mt-3 font-semibold">Member profile snapshot</p>
            <div className="mt-3 space-y-2 text-sm text-ink/60">
              <p>Position: <span className="font-medium text-ink">{user.memberProfile?.organizationPosition ?? "Not set"}</span></p>
              <p>Location: <span className="font-medium text-ink">{user.memberProfile?.digitalIdLocation ?? "LETTW Worldwide"}</span></p>
              <p>Department: <span className="font-medium text-ink">{user.department?.name ?? "Not assigned"}</span></p>
              <p>Membership status: <span className="font-medium text-ink">{user.memberProfile?.membershipStatus ?? "ACTIVE"}</span></p>
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
