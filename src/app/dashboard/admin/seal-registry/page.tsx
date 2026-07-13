import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, QrCode } from "lucide-react";

import { auth } from "@/auth";
import { OfficialSealRegistryBrowser } from "@/components/dashboard/official-seal-registry-browser";
import { Badge } from "@/components/ui/badge";
import { officialSealRegistrySummary } from "@/lib/official-registry";
import { hasAnyWorkspacePermission } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OfficialSealRegistryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await hasAnyWorkspacePermission(session.user.id, "canManageOfficialRegistry"))) redirect("/dashboard");

  const records = await officialSealRegistrySummary();
  const activeCount = records.filter((record) => record.active).length;
  const inactiveCount = records.length - activeCount;
  const typeCounts = records.reduce<Record<string, number>>((summary, record) => {
    summary[record.kind] = (summary[record.kind] ?? 0) + 1;
    return summary;
  }, {});

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <BadgeCheck className="h-4 w-4" />
              Official LETW seal registry
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Document authenticity and seal control</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
              Review official letters, certificates, digital IDs, giving receipts, monthly reports, handovers, and digital signatures.
              Every listed record has a seal number or verification code that can be checked publicly.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-moss px-4 text-sm font-medium text-white" href="/verify">
              <QrCode className="h-4 w-4" />
              Open scanner
            </Link>
            <Link className="inline-flex h-10 items-center rounded-md border border-ink/10 bg-paper px-4 text-sm font-medium text-ink" href="/dashboard/admin">
              Back to admin
            </Link>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <Metric label="Registry records" value={records.length} />
        <Metric label="Active / accepted" value={activeCount} />
        <Metric label="Inactive / rejected" value={inactiveCount} />
      </section>

      <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
        <div className="flex flex-wrap gap-2">
          {Object.entries(typeCounts).map(([type, count]) => (
            <Badge key={type}>{type.toLowerCase().replaceAll("_", " ")}: {count}</Badge>
          ))}
        </div>
      </section>

      <OfficialSealRegistryBrowser
        records={records.map((record) => ({
          ...record,
          issuedAt: record.issuedAt?.toISOString() ?? null
        }))}
      />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
      <p className="text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-sm text-ink/55">{label}</p>
    </div>
  );
}
