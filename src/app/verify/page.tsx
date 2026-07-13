import Image from "next/image";
import Link from "next/link";
import { QrCode } from "lucide-react";

import { OfficialAuthenticityScanner } from "@/components/dashboard/official-authenticity-scanner";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PublicVerifyPage({
  searchParams
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;

  return (
    <main className="min-h-screen bg-paper px-4 py-8">
      <section className="mx-auto mb-6 max-w-5xl overflow-hidden rounded-lg border border-ink/10 bg-white shadow-soft">
        <div className="bg-[#0b1b3d] px-6 py-6 text-white">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white p-2">
                <Image alt="LETW logo" className="h-full w-full object-contain" height={96} src="/letw-logo.png" width={96} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d4af37]">Light Encounter Tabernacle Worldwide</p>
                <h1 className="mt-2 text-3xl font-semibold">Document Authenticity Scanner</h1>
                <p className="mt-2 max-w-2xl text-sm text-white/75">
                  Scan or paste a LETW QR code, seal number, certificate number, letter number, report code, handover code, or digital ID.
                </p>
              </div>
            </div>
            <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-white px-4 text-sm font-medium text-[#0b1b3d]" href="https://letw.org">
              <QrCode className="h-4 w-4" />
              letw.org
            </Link>
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-5xl">
        <OfficialAuthenticityScanner initialCode={q ?? ""} />
      </div>
    </main>
  );
}
