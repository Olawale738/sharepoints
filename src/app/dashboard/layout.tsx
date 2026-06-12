import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { WorkspaceRole } from "@prisma/client";

import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { prisma } from "@/lib/prisma";

function canCreateWorkspaceFromRole(role: string) {
  return role === "ADMIN" || role === "LEADER" || role === "EDITOR";
}

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const ownMemberships = await prisma.workspaceMember.findMany({
    where: { userId: session.user.id, workspace: { deletedAt: null } },
    include: {
      workspace: {
        include: {
          _count: {
            select: {
              files: true,
              members: true
            }
          }
        }
      }
    },
    orderBy: {
      joinedAt: "asc"
    }
  });
  const isGlobalAdmin = ownMemberships.some((membership) => membership.role === WorkspaceRole.ADMIN);
  const globalWorkspaces = isGlobalAdmin
    ? await prisma.workspace.findMany({
        where: { deletedAt: null },
        include: {
          members: {
            where: {
              userId: session.user.id
            },
            select: {
              role: true
            }
          },
          _count: {
            select: {
              files: true,
              members: true
            }
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      })
    : [];

  const workspaces = isGlobalAdmin
    ? globalWorkspaces.map((workspace) => ({
        id: workspace.id,
        name: workspace.name,
        role: WorkspaceRole.ADMIN,
        filesCount: workspace._count.files,
        membersCount: workspace._count.members
      }))
    : ownMemberships.map((membership) => ({
        id: membership.workspace.id,
        name: membership.workspace.name,
        role: membership.role,
        filesCount: membership.workspace._count.files,
        membersCount: membership.workspace._count.members
      }));
  const canCreateWorkspace =
    isGlobalAdmin || ownMemberships.some((membership) => canCreateWorkspaceFromRole(membership.role));

  return (
    <DashboardShell user={session.user} workspaces={workspaces} canCreateWorkspace={canCreateWorkspace}>
      {children}
    </DashboardShell>
  );
}
