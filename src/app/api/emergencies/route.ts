import { EmergencyIncidentStatus } from "@prisma/client";

import { handleRouteError, ok, requireUser } from "@/lib/api";
import { getOrganizationAncestorIds } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export async function GET() {
  try {
    const user = await requireUser();
    const isAdmin = await hasAnyWorkspaceAdminRole(user.id);
    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: user.id, workspace: { deletedAt: null } },
      select: {
        workspaceId: true,
        workspace: { select: { organizationUnitId: true } }
      }
    });
    const workspaceIds = memberships.map((membership) => membership.workspaceId);
    const directOrganizationUnitIds = memberships
      .map((membership) => membership.workspace.organizationUnitId)
      .filter((id): id is string => Boolean(id));
    const organizationUnitIds = await getOrganizationAncestorIds(directOrganizationUnitIds);

    const incidents = await prisma.emergencyIncident.findMany({
      where: isAdmin
        ? {}
        : {
            status: EmergencyIncidentStatus.ACTIVE,
            OR: [
              { workspaceId: { in: workspaceIds } },
              { organizationUnitId: { in: organizationUnitIds } },
              { workspaceId: null, organizationUnitId: null }
            ]
          },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100
    });
    const responses = await prisma.emergencyWelfareResponse.findMany({
      where: { userId: user.id, incidentId: { in: incidents.map((incident) => incident.id) } }
    });

    return ok({ incidents, responses, isAdmin });
  } catch (error) {
    return handleRouteError(error);
  }
}
