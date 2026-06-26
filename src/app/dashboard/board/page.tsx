import { FileLock2 } from "lucide-react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { BoardPortalPanel } from "@/components/dashboard/board-portal-panel";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export default async function BoardPortalPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await hasAnyWorkspaceAdminRole(session.user.id))) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-medium text-moss">
          <FileLock2 className="h-4 w-4" />
          LETW private board portal
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Trustees, resolutions and oversight</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink/60">
          Securely manage board minutes, resolutions, legal documents, financial oversight, approvals and action items.
        </p>
      </section>
      <BoardPortalPanel />
    </div>
  );
}
