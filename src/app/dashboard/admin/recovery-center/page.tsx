import Link from "next/link";
import { redirect } from "next/navigation";
import { ArchiveRestore } from "lucide-react";

import { auth } from "@/auth";
import { RecoveryCenterPanel } from "@/components/dashboard/recovery-center-panel";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export default async function RecoveryCenterPage() {
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
              <ArchiveRestore className="h-4 w-4" />
              Backup recovery
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Backup Recovery Center</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
              Restore deleted files, messages, users, workspaces, certificates, letters, and reports without touching the database manually.
            </p>
          </div>
          <Link
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-ink/10 bg-paper px-4 text-sm font-medium text-ink transition hover:bg-mint/50"
            href="/dashboard/admin/command-center"
          >
            Command center
          </Link>
        </div>
      </section>

      <RecoveryCenterPanel />
    </div>
  );
}
