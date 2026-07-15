import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck2, Crown, ShieldCheck } from "lucide-react";

import { auth } from "@/auth";
import { ExecutiveOperationsPanel } from "@/components/dashboard/executive-operations-panel";
import { Badge } from "@/components/ui/badge";
import { hasAnyActivePresidentDelegation } from "@/lib/executive-operations";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export default async function ExecutiveOperationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const canOpen = (await hasAnyWorkspaceAdminRole(session.user.id)) || (await hasAnyActivePresidentDelegation(session.user.id));
  if (!canOpen) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <Crown className="h-4 w-4" />
              Executive operations
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Prayer, guests, calendar, delegation, cleanup</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
              Assign prayer work, detect calendar conflicts, give secure temporary guest access, delegate president-approved
              powers, and clean stale access from one controlled center.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-mint text-moss">
              <ShieldCheck className="h-3.5 w-3.5" />
              Permission-aware
            </Badge>
            <Badge className="bg-paper text-ink">
              <CalendarCheck2 className="h-3.5 w-3.5" />
              Conflict scanner
            </Badge>
          </div>
        </div>
        <Link className="mt-4 inline-flex h-10 items-center rounded-md border border-ink/10 bg-paper px-4 text-sm font-medium hover:bg-mint/40" href="/dashboard/admin">
          Back to admin center
        </Link>
      </section>

      <ExecutiveOperationsPanel />
    </div>
  );
}
