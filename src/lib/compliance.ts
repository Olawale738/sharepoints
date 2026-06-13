import {
  ComplianceAudienceType,
  ComplianceAssignmentStatus,
  ComplianceCampaignStatus,
  type Prisma
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function resolveComplianceRecipients(input: {
  audienceType: ComplianceAudienceType;
  audienceReferenceId?: string | null;
  selectedUserIds?: string[];
}) {
  const activeUserWhere: Prisma.UserWhereInput = {
    deletedAt: null,
    suspendedAt: null,
    accessRevokedAt: null
  };

  if (input.audienceType === ComplianceAudienceType.DEPARTMENT) {
    return prisma.user.findMany({
      where: { ...activeUserWhere, departmentId: input.audienceReferenceId },
      select: { id: true }
    });
  }
  if (input.audienceType === ComplianceAudienceType.WORKSPACE) {
    return prisma.user.findMany({
      where: {
        ...activeUserWhere,
        workspaceMemberships: { some: { workspaceId: input.audienceReferenceId! } }
      },
      select: { id: true }
    });
  }
  if (input.audienceType === ComplianceAudienceType.SELECTED) {
    return prisma.user.findMany({
      where: { ...activeUserWhere, id: { in: input.selectedUserIds ?? [] } },
      select: { id: true }
    });
  }
  return prisma.user.findMany({
    where: activeUserWhere,
    select: { id: true }
  });
}

export function effectiveAssignmentStatus(assignment: {
  status: ComplianceAssignmentStatus;
  campaign: { status: ComplianceCampaignStatus; dueAt: Date };
}) {
  if (
    (assignment.status === ComplianceAssignmentStatus.PENDING ||
      assignment.status === ComplianceAssignmentStatus.CHANGES_REQUESTED) &&
    assignment.campaign.status === ComplianceCampaignStatus.ACTIVE &&
    assignment.campaign.dueAt.getTime() < Date.now()
  ) {
    return "OVERDUE" as const;
  }
  return assignment.status;
}
