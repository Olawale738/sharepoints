import Link from "next/link";
import { redirect } from "next/navigation";
import { FileClock } from "lucide-react";

import { auth } from "@/auth";
import { DocumentRenewalWorkflowPanel } from "@/components/dashboard/document-renewal-workflow-panel";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export default async function DocumentRenewalsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await hasAnyWorkspaceAdminRole(session.user.id))) redirect("/dashboard");

  const items = await prisma.documentExpiryItem.findMany({
    orderBy: [{ status: "asc" }, { expiresAt: "asc" }, { reviewDueAt: "asc" }, { createdAt: "desc" }],
    take: 500
  });
  const workspaceIds = Array.from(new Set(items.map((item) => item.workspaceId).filter((id): id is string => Boolean(id))));
  const ownerIds = Array.from(new Set(items.map((item) => item.ownerId).filter((id): id is string => Boolean(id))));
  const [workspaces, owners] = await Promise.all([
    workspaceIds.length
      ? prisma.workspace.findMany({ where: { id: { in: workspaceIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    ownerIds.length
      ? prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, name: true, email: true } })
      : Promise.resolve([])
  ]);
  const workspaceById = new Map(workspaces.map((workspace) => [workspace.id, workspace]));
  const ownerById = new Map(owners.map((owner) => [owner.id, owner]));

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <FileClock className="h-4 w-4" />
              Document expiry and renewal workflow
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Keep LETW records current</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
              Track policies, certificates, permits, forms, uploaded documents, and other records that need review, renewal, owner reminders,
              or archiving.
            </p>
          </div>
          <Link className="inline-flex h-10 items-center rounded-md border border-ink/10 bg-paper px-4 text-sm font-medium hover:bg-mint/40" href="/dashboard/admin">
            Back to admin
          </Link>
        </div>
      </section>
      <DocumentRenewalWorkflowPanel
        items={items.map((item) => {
          const owner = item.ownerId ? ownerById.get(item.ownerId) : null;

          return {
            id: item.id,
            title: item.title,
            targetType: item.targetType,
            targetId: item.targetId,
            workspaceId: item.workspaceId,
            ownerId: item.ownerId,
            reviewDueAt: item.reviewDueAt?.toISOString() ?? null,
            expiresAt: item.expiresAt?.toISOString() ?? null,
            status: item.status,
            notes: item.notes,
            createdAt: item.createdAt.toISOString(),
            workspaceName: item.workspaceId ? workspaceById.get(item.workspaceId)?.name ?? null : null,
            ownerName: owner?.name ?? owner?.email ?? null
          };
        })}
      />
    </div>
  );
}
