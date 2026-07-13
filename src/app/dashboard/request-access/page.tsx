import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { RequestAccessPanel } from "@/components/dashboard/request-access-panel";
import { prisma } from "@/lib/prisma";

type RequestAccessPageProps = {
  searchParams: Promise<{
    targetType?: string;
    targetId?: string;
  }>;
};

function latestStatus(requests: { status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" }[]) {
  return requests[0]?.status ?? null;
}

export default async function RequestAccessPage({ searchParams }: RequestAccessPageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const query = await searchParams;
  const targetType = query.targetType === "FILE" ? "FILE" : query.targetType === "WORKSPACE" ? "WORKSPACE" : null;
  const targetId = query.targetId;

  if (!targetType || !targetId) {
    redirect("/dashboard");
  }

  if (targetType === "WORKSPACE") {
    const workspace = await prisma.workspace.findFirst({
      where: { id: targetId, deletedAt: null },
      select: {
        id: true,
        name: true
      }
    });

    if (!workspace) {
      redirect("/dashboard");
    }

    const requests = await prisma.accessRequest.findMany({
      where: {
        requesterId: session.user.id,
        targetType,
        targetId: workspace.id
      },
      select: { status: true },
      orderBy: { createdAt: "desc" },
      take: 1
    });

    return (
      <div className="mx-auto max-w-3xl">
        <RequestAccessPanel
          targetType="WORKSPACE"
          targetId={workspace.id}
          title={`Request access to ${workspace.name}`}
          description="You are signed in, but this workspace is private. Send a request and a workspace admin, leader, or approved moderator can review it."
          existingStatus={latestStatus(requests)}
        />
      </div>
    );
  }

  const file = await prisma.file.findFirst({
    where: { id: targetId, deletedAt: null, workspace: { deletedAt: null } },
    select: {
      id: true,
      workspace: {
        select: {
          name: true
        }
      }
    }
  });

  if (!file) {
    redirect("/dashboard");
  }

  const requests = await prisma.accessRequest.findMany({
    where: {
      requesterId: session.user.id,
      targetType,
      targetId: file.id
    },
    select: { status: true },
    orderBy: { createdAt: "desc" },
    take: 1
  });

  return (
    <div className="mx-auto max-w-3xl">
      <RequestAccessPanel
        targetType="FILE"
        targetId={file.id}
        title="Request access to this file"
        description={`This file belongs to ${file.workspace.name}. File details remain private until an authorized reviewer approves your access.`}
        existingStatus={latestStatus(requests)}
      />
    </div>
  );
}
