import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";

import { auth } from "@/auth";
import { PresidentialGovernancePanel } from "@/components/dashboard/presidential-governance-panel";
import { Badge } from "@/components/ui/badge";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export default async function PresidentialGovernancePage() {
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
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <ShieldAlert className="h-4 w-4" />
              Presidential governance controls
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Governance, risk, policy, and consent center</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
              Manage LETW document policy, approval locks, watermarking, restricted viewing, leadership accountability, branch risk,
              secure guest review, redaction, minister credentials, incident response, official circulars, and member privacy consent.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-mint text-moss">12 controls</Badge>
            <Badge>audit logged</Badge>
          </div>
        </div>
        <Link className="mt-4 inline-flex h-10 items-center rounded-md border border-ink/10 bg-paper px-4 text-sm font-medium hover:bg-mint/40" href="/dashboard/admin">
          Back to admin center
        </Link>
      </section>

      <PresidentialGovernancePanel />
    </div>
  );
}
