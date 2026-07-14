import Link from "next/link";
import { redirect } from "next/navigation";
import { Crown, LockKeyhole, ShieldAlert } from "lucide-react";

import { auth } from "@/auth";
import { PresidentWallPanel } from "@/components/dashboard/president-wall-panel";
import { Badge } from "@/components/ui/badge";
import { isPresidentAuthority } from "@/lib/president-controls";

export default async function PresidentWallPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (!(await isPresidentAuthority(session.user.id))) {
    redirect("/dashboard/admin");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <Crown className="h-4 w-4" />
              President Approval Wall
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Sensitive approvals and emergency lockdown</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
              Control what must wait for president approval, review pending sensitive actions, and instantly lock high-risk platform
              activity during an emergency.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-mint text-moss"><ShieldAlert className="h-3.5 w-3.5" />Approval wall</Badge>
            <Badge><LockKeyhole className="h-3.5 w-3.5" />Emergency override</Badge>
          </div>
        </div>
        <Link className="mt-4 inline-flex h-10 items-center rounded-md border border-ink/10 bg-paper px-4 text-sm font-medium hover:bg-mint/40" href="/dashboard/admin">
          Back to admin center
        </Link>
      </section>

      <PresidentWallPanel />
    </div>
  );
}
