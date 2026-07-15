import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { auth } from "@/auth";
import { UnifiedCommandCenterPanel } from "@/components/dashboard/unified-command-center-panel";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export default async function UnifiedCommandCenterPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (!(await hasAnyWorkspaceAdminRole(session.user.id))) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-moss">
              <ShieldAlert className="h-4 w-4" />
              Admin command
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Unified command center</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
              One operating dashboard for urgent approvals, notification failures, weak branches, expired access, pending signatures, backup status, security alerts, document lifecycle, and search intelligence.
            </p>
          </div>
          <Link
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-ink/10 bg-paper px-4 text-sm font-medium text-ink transition hover:bg-mint/50"
            href="/dashboard/admin"
          >
            Back to admin
          </Link>
        </div>
      </section>

      <UnifiedCommandCenterPanel />
    </div>
  );
}
