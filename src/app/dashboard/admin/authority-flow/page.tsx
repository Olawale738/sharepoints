import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ClipboardCheck, ShieldCheck, Workflow } from "lucide-react";

import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { getAdminVisibleWorkspaceIds } from "@/lib/governance";
import { prisma } from "@/lib/prisma";
import { defaultPermissionsForRole, hasAnyWorkspacePermission } from "@/lib/rbac";
import { roleLabel } from "@/lib/roles";
import { formatDate } from "@/lib/utils";

export default async function AuthorityFlowPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (!(await hasAnyWorkspacePermission(session.user.id, "canApproveContent"))) {
    redirect("/dashboard");
  }

  const workspaceIds = await getAdminVisibleWorkspaceIds(session.user.id);
  const [approvals, workspaces, savedPermissions] = await Promise.all([
    prisma.approvalRequest.findMany({
      where: { workspaceId: { in: workspaceIds } },
      include: {
        workspace: { select: { id: true, name: true } },
        requester: { select: { name: true, email: true } },
        reviewer: { select: { name: true, email: true } }
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 120
    }),
    prisma.workspace.findMany({
      where: { id: { in: workspaceIds }, deletedAt: null },
      include: {
        members: {
          where: { role: { in: ["ADMIN", "LEADER", "MODERATOR"] } },
          select: {
            id: true,
            role: true,
            user: { select: { name: true, email: true } }
          },
          orderBy: [{ role: "asc" }, { joinedAt: "asc" }]
        }
      },
      orderBy: { name: "asc" },
      take: 100
    }),
    prisma.workspaceRolePermission.findMany({
      where: { workspaceId: { in: workspaceIds }, role: { in: ["LEADER", "MODERATOR"] } }
    })
  ]);

  const pendingApprovals = approvals.filter((approval) => approval.status === "PENDING");

  function canRoleApprove(workspaceId: string, role: "LEADER" | "MODERATOR") {
    const saved = savedPermissions.find((item) => item.workspaceId === workspaceId && item.role === role);
    return saved?.canApproveContent ?? defaultPermissionsForRole(role).canApproveContent;
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <Workflow className="h-4 w-4" />
              Authority flow
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Approval chain and delegated authority</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
              Track which roles can approve content, where pending items are waiting, and how requests move from member
              submission to leader, moderator, admin, or president-level decision.
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

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-ink/10 bg-white p-4">
          <ClipboardCheck className="h-5 w-5 text-moss" />
          <p className="mt-3 text-2xl font-semibold text-ink">{pendingApprovals.length}</p>
          <p className="text-sm text-ink/55">Pending decisions</p>
        </div>
        <div className="rounded-lg border border-ink/10 bg-white p-4">
          <ShieldCheck className="h-5 w-5 text-moss" />
          <p className="mt-3 text-2xl font-semibold text-ink">
            {workspaces.filter((workspace) => canRoleApprove(workspace.id, "LEADER")).length}
          </p>
          <p className="text-sm text-ink/55">Workspaces with leader approval</p>
        </div>
        <div className="rounded-lg border border-ink/10 bg-white p-4">
          <ShieldCheck className="h-5 w-5 text-moss" />
          <p className="mt-3 text-2xl font-semibold text-ink">
            {workspaces.filter((workspace) => canRoleApprove(workspace.id, "MODERATOR")).length}
          </p>
          <p className="text-sm text-ink/55">Workspaces with moderator approval</p>
        </div>
      </section>

      <section className="rounded-lg border border-ink/10 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Pending authority chain</h2>
          <Badge>{pendingApprovals.length}</Badge>
        </div>
        <div className="divide-y divide-ink/10">
          {pendingApprovals.length === 0 ? (
            <p className="px-4 py-8 text-sm text-ink/55">No approval requests are waiting right now.</p>
          ) : null}
          {pendingApprovals.map((approval) => (
            <article className="px-4 py-4" key={approval.id}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge className="bg-wheat">pending</Badge>
                    <span className="text-xs font-medium uppercase text-ink/45">{approval.targetType.toLowerCase()}</span>
                  </div>
                  <h3 className="text-sm font-semibold text-ink">{approval.title}</h3>
                  <p className="mt-1 text-xs text-ink/50">
                    {approval.workspace.name} - requested by {approval.requester.name ?? approval.requester.email ?? "member"} -{" "}
                    {formatDate(approval.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-ink/55">
                  <span className="rounded-full bg-paper px-3 py-1">Requester</span>
                  <ArrowRight className="h-4 w-4 text-ink/35" />
                  <span className="rounded-full bg-paper px-3 py-1">Authorized leader/moderator</span>
                  <ArrowRight className="h-4 w-4 text-ink/35" />
                  <span className="rounded-full bg-mint px-3 py-1">Admin / President</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        {workspaces.map((workspace) => (
          <article className="rounded-lg border border-ink/10 bg-white p-4" key={workspace.id}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-ink">{workspace.name}</h2>
                <p className="mt-1 text-xs text-ink/50">Approval authority in this workspace</p>
              </div>
              <Link className="text-xs font-medium text-moss hover:underline" href={`/dashboard/workspaces/${workspace.id}`}>
                Open workspace
              </Link>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {(["LEADER", "MODERATOR"] as const).map((role) => (
                <div className="rounded-md border border-ink/10 bg-paper p-3" key={role}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium text-ink">{roleLabel(role)}</p>
                    <Badge className={canRoleApprove(workspace.id, role) ? "bg-mint" : "bg-white"}>
                      {canRoleApprove(workspace.id, role) ? "can approve" : "review only"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-ink/50">
                    Change this from the workspace Role permissions panel.
                  </p>
                </div>
              ))}
            </div>
            <div className="mt-3 space-y-2">
              {workspace.members.slice(0, 8).map((member) => (
                <div className="flex items-center justify-between rounded-md border border-ink/10 px-3 py-2 text-sm" key={member.id}>
                  <span className="min-w-0 truncate">{member.user.name ?? member.user.email ?? "Member"}</span>
                  <Badge className="bg-paper">{roleLabel(member.role)}</Badge>
                </div>
              ))}
              {workspace.members.length === 0 ? <p className="text-sm text-ink/55">No delegated leaders or moderators.</p> : null}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
