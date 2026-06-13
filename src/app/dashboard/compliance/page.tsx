import { redirect } from "next/navigation";
import { ClipboardCheck, HeartHandshake } from "lucide-react";

import { auth } from "@/auth";
import { ComplianceCenter } from "@/components/dashboard/compliance-center";

export default async function CompliancePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <p className="flex items-center gap-2 text-sm font-medium text-moss"><ClipboardCheck className="h-4 w-4" />LETW member accountability</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink">Required forms and compliance</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink/60">
          Complete requested member information, receive reminders, and follow review decisions. Administrators can manage campaigns, deadlines, care exceptions, and reversible restrictions.
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-md bg-mint/35 px-3 py-2 text-xs text-ink/60">
          <HeartHandshake className="h-4 w-4 text-moss" />
          Care-aware compliance prevents sanctions before deadlines and gives members a private route to request compassionate consideration.
        </div>
      </section>
      <ComplianceCenter />
    </div>
  );
}
