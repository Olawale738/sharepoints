import { HeartHandshake } from "lucide-react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { GrowthSuitePanel } from "@/components/dashboard/growth-suite-panel";

export default async function PrayerWallPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-medium text-moss">
          <HeartHandshake className="h-4 w-4" />
          LETW global prayer wall
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Prayer, pastoral care, and confidential follow-up</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink/60">
          Create private, pastoral, branch, ministry, country, or workspace prayer requests. Sensitive requests stay restricted to
          administrators, approved leaders, assigned pastors, and the person who created the request.
        </p>
      </section>
      <GrowthSuitePanel />
    </div>
  );
}
