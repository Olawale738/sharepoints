import { ApprovalStatus, WorkspaceRole } from "@prisma/client";

import { ApiError } from "@/lib/api";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getWorkspaceMembership, hasAnyWorkspaceAdminRole, hasWorkspaceAdminAccess } from "@/lib/rbac";

export type ApprovalTargetType = "FILE" | "ANNOUNCEMENT" | "TASK" | "MEETING";

export async function canApproveWorkspaceContent(userId: string, workspaceId: string) {
  if (await hasWorkspaceAdminAccess(userId, workspaceId)) {
    return true;
  }

  const membership = await getWorkspaceMembership(userId, workspaceId);
  return membership?.role === WorkspaceRole.LEADER;
}

export async function initialApprovalStatus(userId: string, workspaceId: string) {
  return (await canApproveWorkspaceContent(userId, workspaceId)) ? ApprovalStatus.APPROVED : ApprovalStatus.PENDING;
}

export async function createApprovalRequestIfNeeded(input: {
  status: ApprovalStatus;
  workspaceId: string;
  requesterId: string;
  targetType: ApprovalTargetType;
  targetId: string;
  title: string;
}) {
  if (input.status !== ApprovalStatus.PENDING) {
    return null;
  }

  const approval = await prisma.approvalRequest.upsert({
    where: {
      targetType_targetId: {
        targetType: input.targetType,
        targetId: input.targetId
      }
    },
    update: {
      title: input.title,
      status: ApprovalStatus.PENDING,
      reason: null,
      reviewerId: null,
      reviewedAt: null
    },
    create: {
      workspaceId: input.workspaceId,
      requesterId: input.requesterId,
      targetType: input.targetType,
      targetId: input.targetId,
      title: input.title
    }
  });

  const reviewers = await prisma.workspaceMember.findMany({
    where: {
      workspaceId: input.workspaceId,
      role: { in: [WorkspaceRole.ADMIN, WorkspaceRole.LEADER] },
      userId: { not: input.requesterId }
    },
    select: { userId: true }
  });
  await notifyUsers(
    reviewers.map((reviewer) => reviewer.userId),
    {
      workspaceId: input.workspaceId,
      type: "APPROVAL_REQUIRED",
      title: `${input.targetType.toLowerCase()} approval required`,
      body: input.title,
      href: `/dashboard/workspaces/${input.workspaceId}`
    }
  );

  return approval;
}

export async function ensureCanSeeFile(userId: string, file: {
  workspaceId: string;
  uploadedById: string;
  approvalStatus: ApprovalStatus;
}) {
  if (file.approvalStatus === ApprovalStatus.APPROVED || file.uploadedById === userId) {
    return;
  }

  if (await canApproveWorkspaceContent(userId, file.workspaceId)) {
    return;
  }

  throw new ApiError(403, "This file is waiting for approval.");
}

export async function applyApprovalDecision(input: {
  reviewerId: string;
  requestId: string;
  status: ApprovalStatus;
  reason?: string | null;
}) {
  const request = await prisma.approvalRequest.findUnique({
    where: {
      id: input.requestId
    }
  });

  if (!request) {
    throw new ApiError(404, "Approval request not found.");
  }

  if (!(await canApproveWorkspaceContent(input.reviewerId, request.workspaceId))) {
    throw new ApiError(403, "Only admins and leaders can approve content.");
  }

  const now = new Date();
  const reviewData = {
    approvalStatus: input.status,
    approvedById: input.status === ApprovalStatus.APPROVED ? input.reviewerId : null,
    approvedAt: input.status === ApprovalStatus.APPROVED ? now : null,
    rejectedReason: input.status === ApprovalStatus.REJECTED ? input.reason ?? "Rejected by reviewer." : null
  };

  await prisma.$transaction(async (tx) => {
    if (request.targetType === "FILE") {
      await tx.file.update({ where: { id: request.targetId }, data: reviewData });
    } else if (request.targetType === "ANNOUNCEMENT") {
      await tx.workspaceAnnouncement.update({ where: { id: request.targetId }, data: reviewData });
    } else if (request.targetType === "TASK") {
      await tx.workspaceTask.update({ where: { id: request.targetId }, data: reviewData });
    } else if (request.targetType === "MEETING") {
      await tx.workspaceMeeting.update({ where: { id: request.targetId }, data: reviewData });
    } else {
      throw new ApiError(422, "Unsupported approval target.");
    }

    await tx.approvalRequest.update({
      where: {
        id: request.id
      },
      data: {
        status: input.status,
        reason: input.reason || null,
        reviewerId: input.reviewerId,
        reviewedAt: now
      }
    });
  });

  return prisma.approvalRequest.findUnique({
    where: {
      id: request.id
    },
    include: {
      requester: {
        select: {
          name: true,
          email: true
        }
      },
      reviewer: {
        select: {
          name: true,
          email: true
        }
      },
      workspace: {
        select: {
          id: true,
          name: true
        }
      }
    }
  });
}

export async function getAdminVisibleWorkspaceIds(userId: string) {
  if (await hasAnyWorkspaceAdminRole(userId)) {
    const workspaces = await prisma.workspace.findMany({
      select: {
        id: true
      }
    });

    return workspaces.map((workspace) => workspace.id);
  }

  const memberships = await prisma.workspaceMember.findMany({
    where: {
      userId
    },
    select: {
      workspaceId: true
    }
  });

  return memberships.map((membership) => membership.workspaceId);
}
