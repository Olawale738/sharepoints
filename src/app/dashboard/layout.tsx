import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { WorkspaceRole } from "@prisma/client";

import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const [ownMemberships, temporaryAccess, currentUser, organizationLeadership] = await Promise.all([
    prisma.workspaceMember.findMany({
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
    }),
    prisma.temporaryWorkspaceAccess.findMany({
      where: {
        userId: session.user.id,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        workspace: { deletedAt: null }
      },
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
        expiresAt: "asc"
      }
    }),
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { locale: true }
    }),
    prisma.organizationUnitLeader.findFirst({
      where: { userId: session.user.id, canCreateWorkspaces: true },
      select: { id: true }
    })
  ]);
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

  const temporaryWorkspaceRows = temporaryAccess
    .filter((grant) => !ownMemberships.some((membership) => membership.workspaceId === grant.workspaceId))
    .map((grant) => ({
      id: grant.workspace.id,
      name: grant.workspace.name,
      role: grant.role,
      filesCount: grant.workspace._count.files,
      membersCount: grant.workspace._count.members
    }));
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
      })).concat(temporaryWorkspaceRows);
  const canCreateWorkspace =
    isGlobalAdmin ||
    Boolean(organizationLeadership);

  return (
    <DashboardShell
      user={session.user}
      locale={currentUser?.locale ?? "en"}
      workspaces={workspaces}
      canCreateWorkspace={canCreateWorkspace}
    >
      {children}
    </DashboardShell>
  );
}
