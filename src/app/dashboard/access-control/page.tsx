import { DoorOpen } from "lucide-react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { AccessControlPanel } from "@/components/dashboard/access-control-panel";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export default async function AccessControlPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await hasAnyWorkspaceAdminRole(session.user.id))) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <p className="flex items-center gap-2 text-sm font-medium text-moss">
          <DoorOpen className="h-4 w-4" />
          LETW access control
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Digital ID door, desk and entrance access</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink/60">
          Use LETW Digital ID QR codes for entrance check-in, define who can open doors or use resources,
          record every scan, and prepare future NFC/RFID or hardware controller integrations.
        </p>
      </section>
      <AccessControlPanel />
    </div>
  );
}
