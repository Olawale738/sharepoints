import Link from "next/link";
import { redirect } from "next/navigation";
import { Award, ClipboardCheck, Crown, FileSignature, GraduationCap, IdCard } from "lucide-react";

import { auth } from "@/auth";
import { OfficialIssuancePanel } from "@/components/dashboard/official-issuance-panel";
import { Badge } from "@/components/ui/badge";
import { isPresidentDocumentAuthority } from "@/lib/governance";

export default async function OfficialIssuancePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (!(await isPresidentDocumentAuthority(session.user.id))) {
    redirect("/dashboard/admin");
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <Crown className="h-4 w-4" />
              Presidential issuing authority
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Official issuer permissions</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
              Certificates, theology academic credentials, digital ID cards, and official LETW letters can be issued only by the
              president, or by leaders/rectors the president explicitly delegates here. School secretaries can be granted theology-school admissions access without receiving wider system administration.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-mint text-moss"><Award className="h-3.5 w-3.5" />Certificates</Badge>
            <Badge className="bg-mint text-moss"><GraduationCap className="h-3.5 w-3.5" />Rector</Badge>
            <Badge className="bg-mint text-moss"><ClipboardCheck className="h-3.5 w-3.5" />School secretary</Badge>
            <Badge className="bg-mint text-moss"><IdCard className="h-3.5 w-3.5" />ID cards</Badge>
            <Badge className="bg-mint text-moss"><FileSignature className="h-3.5 w-3.5" />Letters</Badge>
          </div>
        </div>
        <Link className="mt-4 inline-flex h-10 items-center rounded-md border border-ink/10 bg-paper px-4 text-sm font-medium hover:bg-mint/40" href="/dashboard/admin">
          Back to admin center
        </Link>
      </section>

      <OfficialIssuancePanel />
    </div>
  );
}
