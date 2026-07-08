import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { LeadershipGovernancePanel } from "@/components/dashboard/leadership-governance-panel";
import { getLeadershipGovernanceData } from "@/lib/leadership-governance";

export default async function LeadershipGovernancePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const data = await getLeadershipGovernanceData(session.user.id).catch(() => null);
  if (!data) redirect("/dashboard/member-portal");

  return <LeadershipGovernancePanel initialData={JSON.parse(JSON.stringify(data))} />;
}
