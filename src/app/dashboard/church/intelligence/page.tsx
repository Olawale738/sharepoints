import { Bot } from "lucide-react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ChurchIntelligencePanel } from "@/components/dashboard/church-intelligence-panel";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export default async function ChurchIntelligencePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await hasAnyWorkspaceAdminRole(session.user.id))) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-medium text-moss">
          <Bot className="h-4 w-4" />
          LETW advanced church intelligence
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Ministry intelligence and global growth</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink/60">
          Match volunteers, launch branches, translate ministry content, share resources, auto-build rosters,
          and identify future leaders from one protected command center.
        </p>
      </section>
      <ChurchIntelligencePanel />
    </div>
  );
}
