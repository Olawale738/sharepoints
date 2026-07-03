import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { PwaCenterPanel } from "@/components/dashboard/pwa-center-panel";
import { prisma } from "@/lib/prisma";

export default async function MobileAppPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const pushSubscriptionsCount = await prisma.pushSubscription.count({
    where: {
      userId: session.user.id,
      enabled: true
    }
  });

  return <PwaCenterPanel pushSubscriptionsCount={pushSubscriptionsCount} />;
}
