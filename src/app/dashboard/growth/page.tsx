import { Sprout } from "lucide-react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { GrowthSuitePanel } from "@/components/dashboard/growth-suite-panel";

export default async function GrowthSuitePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-medium text-moss">
          <Sprout className="h-4 w-4" />
          LETW growth suite
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Training, prayer, campaigns and resources</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink/60">
          Manage discipleship training, certificates, prayer and care requests, asset maintenance,
          ministry campaigns, and sermon resources from one permission-aware center.
        </p>
      </section>
      <GrowthSuitePanel />
    </div>
  );
}
