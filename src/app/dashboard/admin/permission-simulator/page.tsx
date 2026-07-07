import Link from "next/link";
import { redirect } from "next/navigation";
import { UserRoundSearch } from "lucide-react";

import { auth } from "@/auth";
import { PermissionSimulatorPanel } from "@/components/dashboard/permission-simulator-panel";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export default async function PermissionSimulatorPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await hasAnyWorkspaceAdminRole(session.user.id))) redirect("/dashboard");
  const users = await prisma.user.findMany({
    where: { deletedAt: null, email: { endsWith: "@letw.org" } },
    select: { id: true, name: true, email: true },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    take: 1000
  });

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <UserRoundSearch className="h-4 w-4" />
              Permission simulator
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Preview member access safely</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
              Select a member and see workspace access, effective role permissions, department rules, leadership scope, active sanctions,
              live share links, and AI-agent exposure without entering the member account.
            </p>
          </div>
          <Link className="inline-flex h-10 items-center rounded-md border border-ink/10 bg-paper px-4 text-sm font-medium hover:bg-mint/40" href="/dashboard/admin">
            Back to admin
          </Link>
        </div>
      </section>
      <PermissionSimulatorPanel users={users} />
    </div>
  );
}
