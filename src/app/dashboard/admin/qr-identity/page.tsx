import Link from "next/link";
import { redirect } from "next/navigation";
import { IdCard } from "lucide-react";

import { auth } from "@/auth";
import { QrIdentityAdminPanel } from "@/components/dashboard/qr-identity-admin-panel";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export default async function QrIdentityAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await hasAnyWorkspaceAdminRole(session.user.id))) redirect("/dashboard");

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <IdCard className="h-4 w-4" />
              LETW QR Identity Center
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Digital ID, QR, access, attendance, and verification</h1>
            <p className="mt-2 max-w-3xl text-sm text-ink/60">
              Manage membership numbers, QR cards, lost cards, renewals, visitor passes, high-security approvals,
              worker badges, onboarding, family links, scan logs, and live entrance registers.
            </p>
          </div>
          <Link className="inline-flex h-10 items-center justify-center rounded-md border border-ink/10 bg-paper px-4 text-sm font-medium" href="/dashboard/admin">
            Back to admin
          </Link>
        </div>
      </section>
      <QrIdentityAdminPanel />
    </div>
  );
}
