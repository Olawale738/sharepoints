import Link from "next/link";

import { SuperAdminRecoveryPanel } from "@/components/dashboard/super-admin-recovery-panel";
import { getProtectedAdminStatuses, superAdminRecoveryConfigured } from "@/lib/protected-admin";

export const dynamic = "force-dynamic";

export default async function AdminRecoveryPage() {
  const protectedAdmins = await getProtectedAdminStatuses();

  return (
    <main className="min-h-screen bg-paper px-4 py-10 text-ink">
      <div className="mx-auto max-w-2xl space-y-5">
        <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
          <p className="text-sm font-semibold text-moss">LETW protected access</p>
          <h1 className="mt-2 text-3xl font-semibold">Emergency admin recovery</h1>
          <p className="mt-2 text-sm leading-6 text-ink/60">
            Use this page only when the protected LETW administrator account has been accidentally suspended, revoked,
            or deleted. A valid recovery code is required.
          </p>
        </div>

        <SuperAdminRecoveryPanel configured={superAdminRecoveryConfigured()} protectedAdmins={protectedAdmins} />

        <Link className="inline-flex text-sm font-medium text-moss hover:underline" href="/login">
          Return to sign in
        </Link>
      </div>
    </main>
  );
}
