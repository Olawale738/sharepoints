import { EmergencyIncidentStatus, WelfareResponseStatus } from "@prisma/client";
import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { getOrganizationAncestorIds } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership } from "@/lib/rbac";

type RouteContext = {
  params: Promise<{ incidentId: string }>;
};

const responseSchema = z.object({
  status: z.nativeEnum(WelfareResponseStatus),
  note: z.string().trim().max(500).nullable().optional()
});

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { incidentId } = await context.params;
    const parsed = responseSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid welfare response.");
    const incident = await prisma.emergencyIncident.findUnique({ where: { id: incidentId } });
    if (!incident || incident.status !== EmergencyIncidentStatus.ACTIVE) {
      throw new ApiError(404, "Active emergency incident not found.");
    }
    if (incident.workspaceId) {
      await requireWorkspaceMembership(user.id, incident.workspaceId);
    } else if (incident.organizationUnitId) {
      const memberships = await prisma.workspaceMember.findMany({
        where: {
          userId: user.id,
          workspace: {
            deletedAt: null
          }
        },
        select: { workspace: { select: { organizationUnitId: true } } }
      });
      const directUnitIds = memberships
        .map((membership) => membership.workspace.organizationUnitId)
        .filter((id): id is string => Boolean(id));
      const accessibleUnitIds = await getOrganizationAncestorIds(directUnitIds);
      if (!accessibleUnitIds.includes(incident.organizationUnitId)) {
        throw new ApiError(403, "This emergency broadcast is outside your church network scope.");
      }
    }

    const response = await prisma.emergencyWelfareResponse.upsert({
      where: { incidentId_userId: { incidentId, userId: user.id } },
      update: {
        status: parsed.data.status,
        note: parsed.data.note ?? null,
        respondedAt: new Date()
      },
      create: {
        incidentId,
        userId: user.id,
        status: parsed.data.status,
        note: parsed.data.note ?? null
      }
    });
    return ok({ response });
  } catch (error) {
    return handleRouteError(error);
  }
}
