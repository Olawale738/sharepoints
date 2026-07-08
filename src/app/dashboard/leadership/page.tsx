import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LeadershipSuitePanel } from "@/components/dashboard/leadership-suite-panel";
import { getLeadershipSuiteData } from "@/lib/leadership-suite";

export default async function LeadershipSuitePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const data = await getLeadershipSuiteData(session.user.id).catch(() => null);
  if (!data) redirect("/dashboard/member-portal");

  return <LeadershipSuitePanel initialData={JSON.parse(JSON.stringify(data))} />;
}
