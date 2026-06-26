"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function VerifyMemberError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="min-h-screen bg-[#edf1f5] px-4 py-10 text-[#0b1f33]">
      <section className="mx-auto max-w-xl rounded-lg border border-red-200 bg-white p-6 text-center shadow-xl">
        <AlertTriangle className="mx-auto h-10 w-10 text-red-700" />
        <h1 className="mt-4 text-2xl font-semibold">Verification temporarily unavailable</h1>
        <p className="mt-2 text-sm text-[#0b1f33]/60">
          LETW could not complete this QR confirmation at this moment. Please try again before accepting the card.
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button onClick={reset}>
            <RotateCcw className="h-4 w-4" />
            Try again
          </Button>
          <Link className="inline-flex h-10 items-center justify-center rounded-md border border-[#0b1f33]/10 px-4 text-sm font-medium hover:bg-[#edf1f5]" href="/login">
            Member sign in
          </Link>
        </div>
      </section>
    </main>
  );
}
