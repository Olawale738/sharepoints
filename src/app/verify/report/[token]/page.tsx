import Image from "next/image";
import Link from "next/link";
import { ShieldCheck, ShieldAlert } from "lucide-react";

import { lookupOfficialSeal } from "@/lib/official-registry";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ReportVerificationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await lookupOfficialSeal(token);

  return <VerificationShell title="LETW Report Verification" result={result} />;
}

function VerificationShell({
  title,
  result
}: {
  title: string;
  result: Awaited<ReturnType<typeof lookupOfficialSeal>>;
}) {
  const active = result.found && result.active;

  return (
    <main className="min-h-screen bg-paper px-4 py-10">
      <section className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-ink/10 bg-white shadow-soft">
        <div className="bg-[#0b1b3d] px-6 py-6 text-white">
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white p-2">
              <Image alt="LETW logo" className="h-full w-full object-contain" height={96} src="/letw-logo.png" width={96} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d4af37]">Light Encounter Tabernacle Worldwide</p>
              <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
            </div>
          </div>
        </div>
        <div className="p-6">
          <div className={`rounded-lg border p-4 ${active ? "border-moss/20 bg-mint/40" : "border-clay/20 bg-clay/10"}`}>
            <div className="flex items-start gap-3">
              {active ? <ShieldCheck className="mt-1 h-6 w-6 text-moss" /> : <ShieldAlert className="mt-1 h-6 w-6 text-clay" />}
              <div>
                <p className="font-semibold text-ink">{result.message}</p>
                <p className="mt-2 text-sm leading-6 text-ink/60">
                  This page confirms current registry status only. It does not expose confidential report contents.
                </p>
              </div>
            </div>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Info label="Title" value={result.title} />
            <Info label="Seal number" value={result.sealNumber ?? "Not recorded"} />
            <Info label="Status" value={result.status ?? "not found"} />
            <Info label="Scope" value={result.scope ?? "LETW official registry"} />
            <Info label="Issued / created" value={result.issuedAt ? formatDate(new Date(result.issuedAt)) : "Not recorded"} />
            <Info label="Expires" value={result.expiresAt ? formatDate(new Date(result.expiresAt)) : "No expiry recorded"} />
          </div>
          {result.warning ? <p className="mt-4 rounded-md bg-clay/10 px-4 py-3 text-sm text-clay">{result.warning}</p> : null}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="inline-flex h-10 items-center rounded-md bg-moss px-4 text-sm font-medium text-white" href="/verify">
              Scan another code
            </Link>
            <Link className="inline-flex h-10 items-center rounded-md border border-ink/10 bg-white px-4 text-sm font-medium text-ink" href="https://letw.org">
              Visit letw.org
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-ink/10 bg-paper p-3">
      <p className="text-xs uppercase tracking-wide text-ink/45">{label}</p>
      <p className="mt-1 break-words font-semibold text-ink">{value}</p>
    </div>
  );
}
