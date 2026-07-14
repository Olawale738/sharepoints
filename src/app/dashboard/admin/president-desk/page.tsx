import Link from "next/link";
import { redirect } from "next/navigation";
import { ClipboardCheck, Crown, FileClock, FileSignature, Handshake, LockKeyhole, ShieldCheck } from "lucide-react";

import { auth } from "@/auth";
import { ApprovalQueue } from "@/components/dashboard/approval-queue";
import { Badge } from "@/components/ui/badge";
import { getAdminVisibleWorkspaceIds } from "@/lib/governance";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole, hasAnyWorkspacePermission } from "@/lib/rbac";
import { formatDate } from "@/lib/utils";

function approvalItem(approval: Awaited<ReturnType<typeof getApprovalItems>>[number]) {
  return {
    id: approval.id,
    targetType: approval.targetType,
    targetId: approval.targetId,
    title: approval.title,
    status: approval.status,
    reason: approval.reason,
    createdAt: approval.createdAt.toISOString(),
    reviewedAt: approval.reviewedAt?.toISOString() ?? null,
    workspace: approval.workspace,
    requester: approval.requester,
    reviewer: approval.reviewer
  };
}

async function getApprovalItems(workspaceIds: string[]) {
  return prisma.approvalRequest.findMany({
    where: { workspaceId: { in: workspaceIds } },
    include: {
      workspace: { select: { id: true, name: true } },
      requester: { select: { name: true, email: true } },
      reviewer: { select: { name: true, email: true } }
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 150
  });
}

export default async function PresidentApprovalDeskPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const canView = await hasAnyWorkspacePermission(session.user.id, "canViewPresidentDesk");
  if (!canView) {
    redirect("/dashboard");
  }

  const isAdmin = await hasAnyWorkspaceAdminRole(session.user.id);
  const workspaceIds = await getAdminVisibleWorkspaceIds(session.user.id);
  const scopedWhere = isAdmin ? {} : { workspaceId: { in: workspaceIds.length ? workspaceIds : ["__none__"] } };
  const [approvals, letters, reports, handovers, signatures, presidentialActions, wallApprovals] = await Promise.all([
    getApprovalItems(workspaceIds),
    prisma.officialLetter.findMany({
      where: { ...scopedWhere, status: "DRAFT" },
      orderBy: { createdAt: "desc" },
      take: 10
    }),
    prisma.monthlyMinistryReport.findMany({
      where: { ...scopedWhere, status: { in: ["DRAFT", "GENERATED"] } },
      orderBy: { createdAt: "desc" },
      take: 10
    }),
    prisma.leadershipHandover.findMany({
      where: { ...scopedWhere, status: { in: ["DRAFT", "PENDING_ACCEPTANCE", "ACCEPTED"] } },
      orderBy: { updatedAt: "desc" },
      take: 10
    }),
    prisma.digitalSignature.findMany({
      where: { status: "REQUESTED" },
      orderBy: { createdAt: "desc" },
      take: 10
    }),
    prisma.presidentialActionItem.findMany({
      where: { ...scopedWhere, status: { in: ["PENDING", "IN_REVIEW", "ASSIGNED"] } },
      orderBy: [{ priority: "desc" }, { dueAt: "asc" }, { createdAt: "desc" }],
      take: 12
    }),
    prisma.presidentialApprovalItem.findMany({
      where: { status: "PENDING" },
      orderBy: { createdAt: "desc" },
      take: 12
    })
  ]);

  const pendingApprovals = approvals.filter((approval) => approval.status === "PENDING").length;
  const metricCards = [
    { label: "Pending approvals", value: pendingApprovals, detail: "Files, meetings, tasks, announcements", icon: ClipboardCheck },
    { label: "Draft letters", value: letters.length, detail: "Official letters awaiting issue", icon: FileSignature },
    { label: "Reports", value: reports.length, detail: "Monthly packs requiring review", icon: FileClock },
    { label: "Handovers", value: handovers.length, detail: "Leadership transition matters", icon: Handshake },
    { label: "Signatures", value: signatures.length, detail: "Documents awaiting signature", icon: ShieldCheck },
    { label: "Presidential actions", value: presidentialActions.length, detail: "Executive decisions needing movement", icon: Crown },
    { label: "Approval wall", value: wallApprovals.length, detail: "Sensitive requests waiting for president", icon: LockKeyhole }
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <Crown className="h-4 w-4" />
              President approval desk
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">High-authority review center</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
              Review pending collaboration approvals, executive letters, report packs, leadership handovers, requested
              signatures, and presidential action items from one controlled desk.
            </p>
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center rounded-md border border-ink/10 bg-paper px-4 text-sm font-medium text-ink hover:bg-mint/50"
            href="/dashboard/admin"
          >
            Back to admin center
          </Link>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {metricCards.map((metric) => {
          const Icon = metric.icon;
          return (
            <div className="rounded-lg border border-ink/10 bg-white p-4" key={metric.label}>
              <Icon className="h-5 w-5 text-moss" />
              <p className="mt-3 text-2xl font-semibold text-ink">{metric.value}</p>
              <p className="text-sm text-ink/55">{metric.label}</p>
              <p className="mt-1 text-xs text-ink/45">{metric.detail}</p>
            </div>
          );
        })}
      </section>

      <ApprovalQueue approvals={approvals.map(approvalItem)} title="President approval queue" />

      <section className="grid gap-4 xl:grid-cols-2">
        <DeskList
          title="Official letters"
          empty="No draft official letters need attention."
          items={letters.map((item) => ({
            id: item.id,
            title: item.title,
            meta: `${item.letterType.toLowerCase().replaceAll("_", " ")} - ${item.recipientName} - ${formatDate(item.createdAt)}`,
            href: "/dashboard/leadership-governance",
            status: item.status
          }))}
        />
        <DeskList
          title="Monthly reports"
          empty="No generated reports need attention."
          items={reports.map((item) => ({
            id: item.id,
            title: item.title,
            meta: `${item.month}/${item.year} - ${formatDate(item.createdAt)}`,
            href: "/dashboard/leadership-governance",
            status: item.status
          }))}
        />
        <DeskList
          title="Leadership handovers"
          empty="No handovers need attention."
          items={handovers.map((item) => ({
            id: item.id,
            title: item.title,
            meta: `${item.status.toLowerCase().replaceAll("_", " ")} - updated ${formatDate(item.updatedAt)}`,
            href: "/dashboard/leadership-governance",
            status: item.status
          }))}
        />
        <DeskList
          title="President Approval Wall"
          empty="No sensitive approval wall requests are waiting."
          items={wallApprovals.map((item) => ({
            id: item.id,
            title: item.title,
            meta: `${item.targetType.toLowerCase().replaceAll("_", " ")} - ${formatDate(item.createdAt)}`,
            href: "/dashboard/admin/president-wall",
            status: item.status
          }))}
        />
        <DeskList
          title="Presidential actions"
          empty="No active presidential action items."
          items={presidentialActions.map((item) => ({
            id: item.id,
            title: item.title,
            meta: `${item.priority.toLowerCase()} priority${item.dueAt ? ` - due ${formatDate(item.dueAt)}` : ""}`,
            href: "/dashboard/executive-briefing",
            status: item.status
          }))}
        />
      </section>
    </div>
  );
}

function DeskList({
  title,
  empty,
  items
}: {
  title: string;
  empty: string;
  items: Array<{ id: string; title: string; meta: string; href: string; status: string }>;
}) {
  return (
    <section className="rounded-lg border border-ink/10 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        <Badge>{items.length}</Badge>
      </div>
      <div className="divide-y divide-ink/10">
        {items.length === 0 ? <p className="px-4 py-8 text-sm text-ink/55">{empty}</p> : null}
        {items.map((item) => (
          <Link className="block px-4 py-3 transition hover:bg-mint/35" href={item.href} key={item.id}>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-ink">{item.title}</p>
              <Badge className="bg-paper">{item.status.toLowerCase().replaceAll("_", " ")}</Badge>
            </div>
            <p className="mt-1 text-xs text-ink/50">{item.meta}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
