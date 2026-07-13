import { ApprovalStatus, WorkspaceRole } from "@prisma/client";

import { hasActiveFileGrant } from "@/lib/access-requests";
import { ApiError } from "@/lib/api";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { getRolePermissions, getWorkspaceMembership, hasAnyWorkspaceAdminRole, hasWorkspaceAdminAccess } from "@/lib/rbac";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function presidentDocumentAuthorityEmails() {
  return Array.from(
    new Set(
      [process.env.PRESIDENT_ADMIN_EMAIL, process.env.SEED_ADMIN_EMAIL ?? "president@letw.org"]
        .filter(Boolean)
        .map((email) => normalizeEmail(String(email)))
    )
  );
}

export type ApprovalTargetType =
  | "FILE"
  | "ANNOUNCEMENT"
  | "TASK"
  | "MEETING"
  | "FORM_RESPONSE"
  | "OFFICIAL_LETTER"
  | "MONTHLY_REPORT"
  | "LEADERSHIP_HANDOVER"
  | "PRESIDENTIAL_ACTION";

const restrictedSensitivityLabels = new Set([
  "LEADERSHIP_ONLY",
  "PASTORAL_CONFIDENTIAL",
  "FINANCE_CONFIDENTIAL",
  "BOARD_ONLY",
  "LEGAL_HOLD",
  "SAFEGUARDING_RESTRICTED"
]);

export async function canApproveWorkspaceContent(userId: string, workspaceId: string) {
  if (await hasWorkspaceAdminAccess(userId, workspaceId)) {
    return true;
  }

  const membership = await getWorkspaceMembership(userId, workspaceId);
  if (!membership) return false;

  const permissions = await getRolePermissions(workspaceId, membership.role);
  return permissions.canApproveContent;
}

export async function hasElevatedFileAccess(userId: string, workspaceId: string) {
  if (await hasAnyWorkspaceAdminRole(userId)) {
    return true;
  }

  const membership = await getWorkspaceMembership(userId, workspaceId);

  return membership?.role === WorkspaceRole.ADMIN || membership?.role === WorkspaceRole.LEADER;
}

export async function isPresidentDocumentAuthority(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true }
  });

  return Boolean(user?.email && presidentDocumentAuthorityEmails().includes(normalizeEmail(user.email)));
}

export async function hasActiveFileDownloadGrant(userId: string, fileId?: string | null) {
  if (!fileId) return false;
  const grant = await prisma.fileAccessGrant.findUnique({
    where: {
      fileId_userId: {
        fileId,
        userId
      }
    },
    select: {
      accessLevel: true,
      revokedAt: true,
      expiresAt: true
    }
  });

  return Boolean(
    grant &&
      grant.accessLevel === "DOWNLOAD" &&
      !grant.revokedAt &&
      (!grant.expiresAt || grant.expiresAt > new Date())
  );
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
      role: { in: [WorkspaceRole.ADMIN, WorkspaceRole.LEADER, WorkspaceRole.MODERATOR] },
      userId: { not: input.requesterId }
    },
    select: { userId: true }
  });
  const authorizedReviewers = [];
  for (const reviewer of reviewers) {
    if (await canApproveWorkspaceContent(reviewer.userId, input.workspaceId)) {
      authorizedReviewers.push(reviewer.userId);
    }
  }

  await notifyUsers(
    authorizedReviewers,
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
  id?: string | null;
  workspaceId: string;
  uploadedById: string;
  approvalStatus: ApprovalStatus;
  sensitivityLabel?: string | null;
  dlpRestricted?: boolean | null;
}) {
  const isUploader = file.uploadedById === userId;
  const canApprove = await canApproveWorkspaceContent(userId, file.workspaceId);
  const hasFileGrant = file.id ? await hasActiveFileGrant(userId, file.id) : false;
  const restricted =
    Boolean(file.dlpRestricted) ||
    (file.sensitivityLabel ? restrictedSensitivityLabels.has(file.sensitivityLabel) : false);

  if (restricted && !isUploader && !canApprove && !hasFileGrant) {
    throw new ApiError(403, "This document is restricted to authorized leaders or administrators.");
  }

  if (file.approvalStatus === ApprovalStatus.APPROVED || isUploader || hasFileGrant) {
    return;
  }

  if (canApprove) {
    return;
  }

  throw new ApiError(403, "This file is waiting for approval.");
}

export async function ensureCanDownloadFile(userId: string, file: {
  id?: string | null;
  workspaceId: string;
  uploadedById: string;
  approvalStatus: ApprovalStatus;
  sensitivityLabel?: string | null;
  dlpRestricted?: boolean | null;
  downloadRestricted?: boolean | null;
}) {
  await ensureCanSeeFile(userId, file);

  if (!(await isPresidentDocumentAuthority(userId)) && !(await hasActiveFileDownloadGrant(userId, file.id))) {
    throw new ApiError(403, "Only the president or members granted document download permission can download this document.");
  }
}

export async function ensureCanEditFile(userId: string, file: {
  id?: string | null;
  workspaceId: string;
  uploadedById: string;
  approvalStatus: ApprovalStatus;
  sensitivityLabel?: string | null;
  dlpRestricted?: boolean | null;
}) {
  await ensureCanSeeFile(userId, file);

  if (!(await isPresidentDocumentAuthority(userId))) {
    throw new ApiError(403, "Only the president can edit this document.");
  }
}

export async function ensureCanShareFile(userId: string, file: {
  id?: string | null;
  workspaceId: string;
  uploadedById: string;
  approvalStatus: ApprovalStatus;
  sensitivityLabel?: string | null;
  dlpRestricted?: boolean | null;
  shareRestricted?: boolean | null;
}) {
  await ensureCanSeeFile(userId, file);
  const hasFileGrant = file.id ? await hasActiveFileGrant(userId, file.id) : false;

  if (file.shareRestricted && file.uploadedById !== userId && !hasFileGrant && !(await canApproveWorkspaceContent(userId, file.workspaceId))) {
    throw new ApiError(403, "Share links are restricted for this document.");
  }
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
    throw new ApiError(403, "Your role does not have approval authority for this workspace.");
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
    } else if (request.targetType === "FORM_RESPONSE") {
      await tx.workspaceFormResponse.update({
        where: { id: request.targetId },
        data: {
          approvalStatus: input.status,
          reviewedById: input.reviewerId,
          reviewedAt: now,
          rejectedReason: input.status === ApprovalStatus.REJECTED ? input.reason ?? "Rejected by reviewer." : null
        }
      });
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
      where: { deletedAt: null },
      select: {
        id: true
      }
    });

    return workspaces.map((workspace) => workspace.id);
  }

  const memberships = await prisma.workspaceMember.findMany({
    where: {
      userId,
      workspace: { deletedAt: null }
    },
    select: {
      workspaceId: true
    }
  });

  return memberships.map((membership) => membership.workspaceId);
}
