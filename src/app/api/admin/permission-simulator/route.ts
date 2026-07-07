import { WorkspaceRole } from "@prisma/client";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  allWorkspacePermissions,
  getRolePermissions,
  hasAnyWorkspaceAdminRole,
  hasAnyWorkspaceCreatorRole
} from "@/lib/rbac";
import { userAccessStatus } from "@/lib/user-access";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const actor = await requireUser();
    if (!(await hasAnyWorkspaceAdminRole(actor.id))) {
      throw new ApiError(403, "Only administrators can simulate permissions.");
    }

    const userId = new URL(request.url).searchParams.get("userId");
    if (!userId) throw new ApiError(422, "Choose a member to simulate.");

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        department: { select: { id: true, name: true, kind: true } },
        memberProfile: {
          select: {
            membershipNumber: true,
            organizationPosition: true,
            membershipStatus: true,
            currentOrganizationUnitId: true
          }
        },
        sanctionsReceived: {
          where: { status: "ACTIVE" },
          select: { type: true, reason: true, expiresAt: true }
        }
      }
    });

    if (!user) throw new ApiError(404, "Member not found.");

    const [isGlobalAdmin, canCreateWorkspace, organizationLeadership, workspaces, memberships, departmentRules, shareLinks, aiAgents] =
      await Promise.all([
        hasAnyWorkspaceAdminRole(user.id),
        hasAnyWorkspaceCreatorRole(user.id),
        prisma.organizationUnitLeader.findMany({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" }
        }),
        prisma.workspace.findMany({
          where: { deletedAt: null },
          include: {
            _count: { select: { files: true, members: true, chatChannels: true } }
          },
          orderBy: { name: "asc" }
        }),
        prisma.workspaceMember.findMany({
          where: { userId: user.id, workspace: { deletedAt: null } }
        }),
        prisma.workspaceDepartmentAccess.findMany({
          where: { canAccessWorkspace: true },
          select: { workspaceId: true, departmentId: true, canAccessWorkspace: true, canAccessChat: true }
        }),
        prisma.fileShareLink.findMany({
          where: {
            createdById: user.id,
            OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
            file: { deletedAt: null }
          },
          include: { file: { select: { fileName: true, workspaceId: true } } },
          take: 25
        }),
        prisma.workspaceAiAgent.findMany({
          where: { enabled: true },
          select: { id: true, name: true, workspaceId: true, organizationUnitId: true, allowedSourceTypes: true }
        })
      ]);

    const leadershipUnitIds = Array.from(new Set(organizationLeadership.map((leader) => leader.unitId)));
    const leadershipUnits = leadershipUnitIds.length
      ? await prisma.organizationUnit.findMany({
          where: { id: { in: leadershipUnitIds } },
          select: { id: true, name: true, type: true, code: true }
        })
      : [];
    const leadershipUnitById = new Map(leadershipUnits.map((unit) => [unit.id, unit]));
    const membershipByWorkspace = new Map(memberships.map((membership) => [membership.workspaceId, membership]));
    const departmentRulesByWorkspace = new Map<string, typeof departmentRules>();
    for (const rule of departmentRules) {
      departmentRulesByWorkspace.set(rule.workspaceId, [...(departmentRulesByWorkspace.get(rule.workspaceId) ?? []), rule]);
    }

    const simulatedWorkspaces = await Promise.all(
      workspaces.map(async (workspace) => {
        const membership = membershipByWorkspace.get(workspace.id);
        const rules = departmentRulesByWorkspace.get(workspace.id) ?? [];
        const departmentBlocked = Boolean(
          rules.length && (!user.departmentId || !rules.some((rule) => rule.departmentId === user.departmentId && rule.canAccessWorkspace))
        );
        const accessible = isGlobalAdmin || (Boolean(membership) && !departmentBlocked);
        const role = isGlobalAdmin ? WorkspaceRole.ADMIN : membership?.role ?? null;
        const permissions = isGlobalAdmin
          ? allWorkspacePermissions
          : membership && accessible
            ? await getRolePermissions(workspace.id, membership.role)
            : null;
        const reasons = [
          isGlobalAdmin ? "Organization admin has full workspace visibility." : null,
          membership ? `Direct workspace role: ${membership.role.toLowerCase()}.` : "No direct workspace membership.",
          departmentBlocked ? "Department access rule blocks this member." : null,
          rules.length && !departmentBlocked ? "Department access rule permits this member." : null
        ].filter(Boolean);

        return {
          id: workspace.id,
          name: workspace.name,
          organizationUnitId: workspace.organizationUnitId,
          accessible,
          role,
          permissions,
          reasons,
          counts: workspace._count
        };
      })
    );

    return ok({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        status: userAccessStatus(user),
        department: user.department,
        category: user.category,
        profile: user.memberProfile,
        sanctions: user.sanctionsReceived
      },
      summary: {
        isGlobalAdmin,
        canCreateWorkspace,
        accessibleWorkspaces: simulatedWorkspaces.filter((workspace) => workspace.accessible).length,
        blockedWorkspaces: simulatedWorkspaces.filter((workspace) => !workspace.accessible).length,
        activeShareLinks: shareLinks.length,
        scopedAiAgents: aiAgents.filter((agent) => !agent.workspaceId || simulatedWorkspaces.some((workspace) => workspace.id === agent.workspaceId && workspace.accessible)).length
      },
      organizationLeadership: organizationLeadership.map((leader) => ({
        id: leader.id,
        title: leader.title,
        canCreateWorkspaces: leader.canCreateWorkspaces,
        inheritToChildren: leader.inheritToChildren,
        unit: leadershipUnitById.get(leader.unitId) ?? {
          id: leader.unitId,
          name: "Unknown unit",
          type: "GLOBAL",
          code: null
        }
      })),
      workspaces: simulatedWorkspaces,
      shareLinks: shareLinks.map((link) => ({
        id: link.id,
        fileName: link.file.fileName,
        workspaceId: link.file.workspaceId,
        expiresAt: link.expiresAt
      })),
      aiAgents
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
