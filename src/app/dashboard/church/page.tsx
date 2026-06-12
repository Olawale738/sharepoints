import { redirect } from "next/navigation";
import { HeartHandshake } from "lucide-react";

import { auth } from "@/auth";
import { ChurchOperationsPanel } from "@/components/dashboard/church-operations-panel";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export default async function ChurchOperationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await hasAnyWorkspaceAdminRole(session.user.id))) redirect("/dashboard");
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-medium text-moss"><HeartHandshake className="h-4 w-4" />LETW church operations</p>
        <h1 className="mt-2 text-3xl font-semibold">Ministry and service operations</h1>
        <p className="mt-2 text-sm text-ink/60">Coordinate ministries, services, attendance, volunteers, pastoral care, and shared resources.</p>
      </section>
      <ChurchOperationsPanel />
    </div>
  );
}
