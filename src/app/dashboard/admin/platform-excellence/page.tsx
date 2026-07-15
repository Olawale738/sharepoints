import Link from "next/link";
import { redirect } from "next/navigation";
import { Gauge } from "lucide-react";

import { auth } from "@/auth";
import { PlatformExcellencePanel } from "@/components/dashboard/platform-excellence-panel";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export default async function PlatformExcellencePage() {
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
              <Gauge className="h-4 w-4" />
              Admin center
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Platform excellence</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
              Reliability, UI readiness, document editing, mobile app, search coverage, backups, monitoring, and security in one operating view.
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

      <PlatformExcellencePanel />
    </div>
  );
}
