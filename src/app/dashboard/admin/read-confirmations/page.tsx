import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpenCheck } from "lucide-react";

import { auth } from "@/auth";
import { ReadConfirmationAdminPanel } from "@/components/dashboard/read-confirmation-admin-panel";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export default async function ReadConfirmationsAdminPage() {
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
              <BookOpenCheck className="h-4 w-4" />
              Governance and compliance
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Document read confirmations</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
              Require members, leaders, or workspace teams to confirm they have opened and read important LETW documents, reports, letters, policies, and announcements.
            </p>
          </div>
          <Link className="inline-flex h-10 items-center rounded-md border border-ink/10 bg-paper px-4 text-sm font-medium hover:bg-mint/40" href="/dashboard/admin">
            Back to admin
          </Link>
        </div>
      </section>

      <ReadConfirmationAdminPanel />
    </div>
  );
}
