import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

export default async function GivingReceiptVerificationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const receipt = await prisma.givingReceipt.findUnique({
    where: { qrToken: token }
  });
  const active = receipt?.status === "ACTIVE";

  return (
    <main className="min-h-screen bg-paper px-4 py-10">
      <section className="mx-auto max-w-2xl rounded-lg border border-ink/10 bg-white p-6 shadow-soft">
        <p className="text-sm font-semibold text-moss">LETW giving receipt verification</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink">{active ? "Receipt is active" : "Receipt is not valid"}</h1>
        {!receipt ? (
          <p className="mt-4 rounded-md bg-clay/10 px-4 py-3 text-sm text-clay">No receipt exists for this QR code.</p>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border border-ink/10 bg-paper p-3">
              <p className="text-xs uppercase text-ink/45">Receipt number</p>
              <p className="mt-1 font-semibold text-ink">{receipt.receiptNumber}</p>
            </div>
            <div className="rounded-md border border-ink/10 bg-paper p-3">
              <p className="text-xs uppercase text-ink/45">Status</p>
              <p className={active ? "mt-1 font-semibold text-moss" : "mt-1 font-semibold text-clay"}>{receipt.status}</p>
            </div>
            <div className="rounded-md border border-ink/10 bg-paper p-3">
              <p className="text-xs uppercase text-ink/45">Donor</p>
              <p className="mt-1 font-semibold text-ink">{receipt.donorName}</p>
            </div>
            <div className="rounded-md border border-ink/10 bg-paper p-3">
              <p className="text-xs uppercase text-ink/45">Received</p>
              <p className="mt-1 font-semibold text-ink">{formatDate(receipt.receivedAt)}</p>
            </div>
            <div className="rounded-md border border-ink/10 bg-paper p-3">
              <p className="text-xs uppercase text-ink/45">Fund</p>
              <p className="mt-1 font-semibold text-ink">{receipt.fund}</p>
            </div>
            <div className="rounded-md border border-ink/10 bg-paper p-3">
              <p className="text-xs uppercase text-ink/45">Organization</p>
              <p className="mt-1 font-semibold text-ink">Light Encounter Tabernacle Worldwide</p>
            </div>
          </div>
        )}
        <p className="mt-6 text-sm text-ink/60">
          This page confirms whether a giving receipt QR code is live in the LETW system. Revoked, void, deleted, or replaced receipts
          must not be accepted.
        </p>
        <Link className="mt-5 inline-flex h-10 items-center rounded-md bg-moss px-4 text-sm font-medium text-white" href="https://letw.org">
          Visit letw.org
        </Link>
      </section>
    </main>
  );
}
