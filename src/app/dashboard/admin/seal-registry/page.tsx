import Link from "next/link";
import { redirect } from "next/navigation";
import { BadgeCheck, QrCode, ShieldCheck } from "lucide-react";

import { auth } from "@/auth";
import { SealRegistryActions } from "@/components/dashboard/seal-registry-actions";
import { Badge } from "@/components/ui/badge";
import { officialSealRegistrySummary } from "@/lib/official-registry";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function OfficialSealRegistryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await hasAnyWorkspaceAdminRole(session.user.id))) redirect("/dashboard");

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

      <section className="overflow-hidden rounded-lg border border-ink/10 bg-white shadow-soft">
        <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-ink">Latest official records</h2>
          <Badge>{records.length}</Badge>
        </div>
        <div className="divide-y divide-ink/10">
          {records.length === 0 ? <p className="px-4 py-8 text-sm text-ink/55">No official seal records yet.</p> : null}
          {records.map((record, index) => (
            <div className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_12rem_9rem_8rem_8rem]" key={`${record.kind}-${record.sealNumber}-${index}`}>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-semibold text-ink">{record.title}</p>
                  <Badge className={record.active ? "bg-mint" : "bg-clay/10 text-clay"}>{record.active ? "active" : "not accepted"}</Badge>
                </div>
                <p className="mt-1 break-words font-mono text-xs text-ink/55">{record.sealNumber ?? "No seal number"}</p>
                <p className="mt-1 text-xs text-ink/45">
                  {record.ownerName ?? "No public holder"} - {record.message}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-ink/40">Type</p>
                <p className="mt-1 text-sm font-medium text-ink">{record.kind.toLowerCase().replaceAll("_", " ")}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-ink/40">Status</p>
                <p className="mt-1 text-sm font-medium text-ink">{record.status ?? "registered"}</p>
              </div>
              <div className="flex flex-col gap-2 lg:items-end">
                <p className="text-xs text-ink/45">{record.issuedAt ? formatDate(record.issuedAt) : "No date"}</p>
                {record.verificationUrl ? (
                  <Link className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-ink/10 bg-paper px-3 text-xs font-medium text-ink hover:bg-mint/40" href={record.verificationUrl}>
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Verify
                  </Link>
                ) : null}
              </div>
              <SealRegistryActions active={record.active} kind={record.kind} recordId={record.recordId} />
            </div>
          ))}
        </div>
      </section>
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
