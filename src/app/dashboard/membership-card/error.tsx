"use client";

import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function MembershipCardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl rounded-lg border border-clay/20 bg-white p-6 text-center shadow-soft">
      <AlertTriangle className="mx-auto h-10 w-10 text-clay" />
      <h1 className="mt-4 text-2xl font-semibold text-ink">Membership card temporarily unavailable</h1>
      <p className="mt-2 text-sm text-ink/60">
        Your LETW account is safe. The card area could not finish loading, so try again or return to the dashboard.
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>
          <RotateCcw className="h-4 w-4" />
          Try again
        </Button>
        <Link className="inline-flex h-10 items-center justify-center rounded-md border border-ink/10 px-4 text-sm font-medium hover:bg-mint/50" href="/dashboard">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
