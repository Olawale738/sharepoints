import Image from "next/image";
import Link from "next/link";
import { FileCheck2, FileWarning, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageContext = {
  params: Promise<{ token: string }>;
};

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusMessage(status?: string) {
  if (status === "ISSUED") return "This official LETW letter is currently active and verified.";
  if (status === "REVOKED") return "This official LETW letter has been revoked and must not be accepted.";
  if (status === "ARCHIVED") return "This official LETW letter is archived and should be confirmed with LETW before use.";
  if (status === "DRAFT") return "This official LETW letter has not been issued and must not be accepted.";
  return "No official LETW letter exists for this verification code.";
}

export default async function OfficialLetterVerificationPage(context: PageContext) {
  const { token } = await context.params;
  const letter = await prisma.officialLetter.findUnique({
    where: { id: token },
    select: {
      letterNumber: true,
      letterType: true,
      title: true,
      recipientName: true,
      status: true,
      issuedAt: true,
      revokedAt: true,
      updatedAt: true,
      createdAt: true
    }
  });
  const active = letter?.status === "ISSUED";

  return (
    <main className="min-h-screen bg-paper px-4 py-10">
      <section className="mx-auto max-w-3xl overflow-hidden rounded-lg border border-ink/10 bg-white shadow-soft">
        <div className="bg-[#0b1b3d] px-6 py-6 text-white">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white p-2">
                <Image alt="LETW logo" className="h-full w-full object-contain" height={96} src="/letw-logo.png" width={96} />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#d4af37]">Light Encounter Tabernacle Worldwide</p>
                <h1 className="mt-2 text-2xl font-semibold">Official Letter Verification</h1>
              </div>
            </div>
            <Badge className={active ? "border-white/20 bg-white/10 text-white" : "bg-clay text-white"}>
              {letter ? letter.status.toLowerCase() : "not found"}
            </Badge>
          </div>
        </div>

        <div className="p-6">
          <div className="flex items-start gap-3 rounded-lg border border-ink/10 bg-paper p-4">
            {active ? <ShieldCheck className="mt-1 h-6 w-6 text-moss" /> : <FileWarning className="mt-1 h-6 w-6 text-clay" />}
            <div>
              <p className="font-semibold text-ink">{letter ? statusMessage(letter.status) : statusMessage()}</p>
              <p className="mt-2 text-sm leading-6 text-ink/60">
                This page confirms the current status of an LETW official letter. It does not expose the private letter body,
                confidential attachments, internal notes, or protected metadata.
              </p>
            </div>
          </div>

          {letter ? (
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-ink/10 bg-white p-3">
                <p className="text-xs uppercase tracking-wide text-ink/45">Letter number</p>
                <p className="mt-1 break-words font-semibold text-ink">{letter.letterNumber}</p>
              </div>
              <div className="rounded-md border border-ink/10 bg-white p-3">
                <p className="text-xs uppercase tracking-wide text-ink/45">Current status</p>
                <p className={active ? "mt-1 font-semibold text-moss" : "mt-1 font-semibold text-clay"}>{letter.status}</p>
              </div>
              <div className="rounded-md border border-ink/10 bg-white p-3">
                <p className="text-xs uppercase tracking-wide text-ink/45">Letter type</p>
                <p className="mt-1 font-semibold text-ink">{titleCase(letter.letterType)}</p>
              </div>
              <div className="rounded-md border border-ink/10 bg-white p-3">
                <p className="text-xs uppercase tracking-wide text-ink/45">Recipient</p>
                <p className="mt-1 font-semibold text-ink">{active ? letter.recipientName : "Hidden unless active"}</p>
              </div>
              <div className="rounded-md border border-ink/10 bg-white p-3">
                <p className="text-xs uppercase tracking-wide text-ink/45">Issued / re-signed</p>
                <p className="mt-1 font-semibold text-ink">{letter.issuedAt ? formatDate(letter.issuedAt) : "Not issued"}</p>
              </div>
              <div className="rounded-md border border-ink/10 bg-white p-3">
                <p className="text-xs uppercase tracking-wide text-ink/45">Last status update</p>
                <p className="mt-1 font-semibold text-ink">{formatDate(letter.revokedAt ?? letter.updatedAt ?? letter.createdAt)}</p>
              </div>
            </div>
          ) : (
            <p className="mt-6 rounded-md bg-clay/10 px-4 py-3 text-sm text-clay">
              This verification code was not found in the LETW official letter register.
            </p>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <Link className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-moss px-4 text-sm font-medium text-white" href="https://letw.org">
              <FileCheck2 className="h-4 w-4" />
              Visit letw.org
            </Link>
            <Link className="inline-flex h-10 items-center justify-center rounded-md border border-ink/10 bg-white px-4 text-sm font-medium text-ink hover:bg-mint/40" href="/login">
              LETW secure login
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
