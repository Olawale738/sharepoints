import { redirect } from "next/navigation";
import { HeartHandshake } from "lucide-react";

import { auth } from "@/auth";
import { PeopleOperationsPanel } from "@/components/dashboard/people-operations-panel";
import { prisma } from "@/lib/prisma";

export default async function PeopleOperationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const workspaces = await prisma.workspaceMember.findMany({
    where: { userId: session.user.id, workspace: { deletedAt: null } },
    select: { workspace: { select: { id: true, name: true } } },
    orderBy: { joinedAt: "asc" }
  });

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-medium text-moss">
          <HeartHandshake className="h-4 w-4" />
          LETW people and operations
        </p>
        <h1 className="mt-2 text-3xl font-semibold">Care, service and administration</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink/60">
          Guide people from first contact to membership, handle support requests, manage events and policies,
          and coordinate staff availability from one secure area.
        </p>
      </section>
      <PeopleOperationsPanel
        currentUser={{ id: session.user.id, name: session.user.name ?? "", email: session.user.email ?? "" }}
        workspaces={workspaces.map(({ workspace }) => workspace)}
      />
    </div>
  );
}
