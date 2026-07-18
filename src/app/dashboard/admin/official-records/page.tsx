import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRightLeft, Megaphone, ShieldCheck, Stamp } from "lucide-react";

import { auth } from "@/auth";
import { OfficialRecordsPanel } from "@/components/dashboard/official-records-panel";
import { Badge } from "@/components/ui/badge";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OfficialRecordsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await hasAnyWorkspaceAdminRole(session.user.id))) redirect("/dashboard/admin");

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <Stamp className="h-4 w-4" />
              LETW official records
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Transfers, circulars, and seal verification</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
              Manage pastor postings, effective dates, handover checklists, branch assignment history, official circulars,
              QR verification, branch acknowledgements, and live public seal validation.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-mint text-moss"><ArrowRightLeft className="h-3.5 w-3.5" />Pastor postings</Badge>
            <Badge className="bg-mint text-moss"><Megaphone className="h-3.5 w-3.5" />Circulars</Badge>
            <Badge className="bg-mint text-moss"><ShieldCheck className="h-3.5 w-3.5" />QR seals</Badge>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link className="inline-flex h-10 items-center rounded-md border border-ink/10 bg-paper px-4 text-sm font-medium hover:bg-mint/40" href="/dashboard/admin">
            Back to admin center
          </Link>
          <Link className="inline-flex h-10 items-center rounded-md border border-ink/10 bg-white px-4 text-sm font-medium hover:bg-mint/40" href="/verify">
            Open public scanner
          </Link>
        </div>
      </section>

      <OfficialRecordsPanel />
    </div>
  );
}
