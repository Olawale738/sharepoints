import Link from "next/link";
import { redirect } from "next/navigation";
import { Eye, HeartHandshake } from "lucide-react";

import { auth } from "@/auth";
import { EnterpriseAdminPanel } from "@/components/dashboard/enterprise-admin-panel";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export default async function EnterpriseAdminPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await hasAnyWorkspaceAdminRole(session.user.id))) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5">
        <p className="text-sm font-medium text-moss">Enterprise operations</p>
        <h1 className="mt-2 text-3xl font-semibold">Protection, recovery, and automation</h1>
        <p className="mt-2 text-sm text-ink/60">Restore deleted content, create independent backups, and control sensitive information.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link className="inline-flex h-10 items-center gap-2 rounded-md border border-ink/10 px-4 text-sm font-medium hover:bg-mint/50" href="/dashboard/admin/preview"><Eye className="h-4 w-4" />Role preview</Link>
          <Link className="inline-flex h-10 items-center gap-2 rounded-md border border-ink/10 px-4 text-sm font-medium hover:bg-mint/50" href="/dashboard/church"><HeartHandshake className="h-4 w-4" />Church operations</Link>
        </div>
      </section>
      <EnterpriseAdminPanel />
    </div>
  );
}
