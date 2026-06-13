import { Globe2 } from "lucide-react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { GlobalOperationsPanel } from "@/components/dashboard/global-operations-panel";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export default async function GlobalChurchNetworkPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await hasAnyWorkspaceAdminRole(session.user.id))) redirect("/dashboard");

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <p className="flex items-center gap-2 text-sm font-medium text-moss"><Globe2 className="h-4 w-4" />LETW worldwide governance</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink">Global Church Network</h1>
        <p className="mt-2 max-w-4xl text-sm text-ink/60">
          Govern countries, regions, branches, churches, ministries, assigned leaders, pastoral safety, emergency response, member identity, retained records, approved AI agents, and physical resources from one protected command center.
        </p>
      </section>
      <GlobalOperationsPanel />
    </div>
  );
}
