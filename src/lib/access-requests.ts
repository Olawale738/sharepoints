import {
  AccessRequestStatus,
  AccessRequestTargetType,
  NotificationPriority,
  WorkspaceRole
} from "@prisma/client";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError } from "@/lib/api";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import {
  getRolePermissions,
  hasAnyWorkspaceAdminRole,
  requireWorkspaceMemberManager
} from "@/lib/rbac";

type AccessRequestInput = {
  targetType: "WORKSPACE" | "FILE";
  targetId: string;
  requestedRole: "VIEWER" | "USER" | "EDITOR";
  reason?: string | null;
};

const workspaceGrantRoles = new Set<WorkspaceRole>([
  WorkspaceRole.VIEWER,
  WorkspaceRole.USER,
  WorkspaceRole.EDITOR
]);

function accessRequestHref(requestId?: string) {
  return `/dashboard/access-requests${requestId ? `?request=${requestId}` : ""}`;
}

export async function hasActiveFileGrant(userId: string, fileId: string) {
  const grant = await prisma.fileAccessGrant.findUnique({
    where: {
      fileId_userId: {
        fileId,
        userId
      }
    },
    select: {
      revokedAt: true,
      expiresAt: true
    }
  });

  return Boolean(grant && !grant.revokedAt && (!grant.expiresAt || grant.expiresAt > new Date()));
}

export async function getAccessRequestReviewerIds(workspaceId: string, requesterId?: string) {
  const [workspaceMembers, globalAdmins] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: {
        workspaceId,
        role: { in: [WorkspaceRole.ADMIN, WorkspaceRole.LEADER, WorkspaceRole.MODERATOR] }
      },
      select: {
        userId: true,
        role: true
      }
    }),
    prisma.workspaceMember.findMany({
      where: {
        role: WorkspaceRole.ADMIN,
        workspace: { deletedAt: null }
      },
      distinct: ["userId"],
      select: {
        userId: true
      }
    })
  ]);

  const reviewerIds = new Set(globalAdmins.map((admin) => admin.userId));
  for (const member of workspaceMembers) {
    if (member.role === WorkspaceRole.ADMIN) {
      reviewerIds.add(member.userId);
      continue;
    }

    const permissions = await getRolePermissions(workspaceId, member.role);
    if (permissions.canManageMembers) {
      reviewerIds.add(member.userId);
    }
  }

  if (requesterId) {
    reviewerIds.delete(requesterId);
  }

  return Array.from(reviewerIds);
}

export async function getReviewableAccessWorkspaceIds(userId: string) {
  if (await hasAnyWorkspaceAdminRole(userId)) {
    const workspaces = await prisma.workspace.findMany({
      where: { deletedAt: null },
      select: { id: true }
    });
    return workspaces.map((workspace) => workspace.id);
  }

  const memberships = await prisma.workspaceMember.findMany({
    where: {
      userId,
      workspace: { deletedAt: null },
      role: { in: [WorkspaceRole.LEADER, WorkspaceRole.MODERATOR] }
    },
    select: {
      workspaceId: true,
      role: true
    }
  });

  const workspaceIds: string[] = [];
  for (const membership of memberships) {
    const permissions = await getRolePermissions(membership.workspaceId, membership.role);
    if (permissions.canManageMembers) {
      workspaceIds.push(membership.workspaceId);
    }
  }

  return workspaceIds;
}

export async function createAccessRequest(requesterId: string, input: AccessRequestInput) {
  const requestedRole = input.requestedRole as WorkspaceRole;
  if (!workspaceGrantRoles.has(requestedRole)) {
    throw new ApiError(422, "Only viewer, user, or editor access can be requested.");
  }

  let workspaceId: string;
  let workspaceName: string;
  let fileId: string | null = null;

  if (input.targetType === "WORKSPACE") {
    const workspace = await prisma.workspace.findFirst({
      where: { id: input.targetId, deletedAt: null },
      select: { id: true, name: true }
    });

    if (!workspace) {
      throw new ApiError(404, "The requested resource was not found.");
    }

    workspaceId = workspace.id;
    workspaceName = workspace.name;
  } else {
    const file = await prisma.file.findFirst({
      where: { id: input.targetId, deletedAt: null },
      select: {
        id: true,
        fileName: true,
        workspaceId: true,
        workspace: {
          select: { id: true, name: true, deletedAt: true }
        }
      }
    });

    if (!file || file.workspace.deletedAt) {
      throw new ApiError(404, "The requested resource was not found.");
    }

    fileId = file.id;
    workspaceId = file.workspaceId;
    workspaceName = file.workspace.name;
  }

  const existingMembership = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId: requesterId,
        workspaceId
      }
    },
    select: { role: true }
  });
  if (input.targetType === "WORKSPACE" && existingMembership) {
    throw new ApiError(409, "You already have access to this workspace.");
  }
  if (input.targetType === "FILE" && fileId && existingMembership && (await hasActiveFileGrant(requesterId, fileId))) {
    throw new ApiError(409, "You already have access to this file.");
  }

  const pending = await prisma.accessRequest.findFirst({
    where: {
      requesterId,
      targetType: input.targetType as AccessRequestTargetType,
      targetId: input.targetId,
      status: AccessRequestStatus.PENDING
    },
    include: {
      workspace: { select: { id: true, name: true } },
      file: { select: { id: true, fileName: true } },
      requester: { select: { name: true, email: true } },
      reviewer: { select: { name: true, email: true } }
    }
  });

  if (pending) {
    return { request: pending, created: false };
  }

  const request = await prisma.accessRequest.create({
    data: {
      requesterId,
      workspaceId,
      fileId,
      targetType: input.targetType as AccessRequestTargetType,
      targetId: input.targetId,
      requestedRole,
      reason: input.reason?.trim() || null
    },
    include: {
      workspace: { select: { id: true, name: true } },
      file: { select: { id: true, fileName: true } },
      requester: { select: { name: true, email: true } },
      reviewer: { select: { name: true, email: true } }
    }
  });

  const reviewerIds = await getAccessRequestReviewerIds(workspaceId, requesterId);
  await notifyUsers(reviewerIds, {
    workspaceId,
    type: "ACCESS_REQUEST",
    title: `${request.requester.name ?? request.requester.email ?? "A member"} requested access`,
    body:
      input.targetType === "WORKSPACE"
        ? `Workspace: ${workspaceName}`
        : `A file in ${workspaceName} needs access review.`,
    href: accessRequestHref(request.id),
    priority: NotificationPriority.HIGH
  });

  await logActivity({
    userId: requesterId,
    workspaceId,
    action: activityActions.accessRequestCreated,
    targetId: request.id,
    metadata: {
      targetType: request.targetType,
      targetId: request.targetId,
      requestedRole: request.requestedRole
    }
  });

  return { request, created: true };
}

export async function reviewAccessRequest(input: {
  actorId: string;
  requestId: string;
  action: "APPROVE" | "REJECT" | "CANCEL";
  decisionReason?: string | null;
}) {
  const request = await prisma.accessRequest.findUnique({
    where: { id: input.requestId },
    include: {
      workspace: { select: { id: true, name: true, deletedAt: true } },
      file: { select: { id: true, fileName: true, deletedAt: true } },
      requester: { select: { id: true, name: true, email: true } },
      reviewer: { select: { name: true, email: true } }
    }
  });

  if (!request) {
    throw new ApiError(404, "Access request not found.");
  }
  if (request.status !== AccessRequestStatus.PENDING) {
    throw new ApiError(409, "This access request has already been reviewed.");
  }
  if (request.workspace.deletedAt) {
    throw new ApiError(404, "The workspace for this request no longer exists.");
  }
  if (request.targetType === AccessRequestTargetType.FILE && (!request.file || request.file.deletedAt)) {
    throw new ApiError(404, "The file for this request no longer exists.");
  }

  if (input.action === "CANCEL") {
    if (input.actorId !== request.requesterId) {
      await requireWorkspaceMemberManager(input.actorId, request.workspaceId);
    }
  } else {
    await requireWorkspaceMemberManager(input.actorId, request.workspaceId);
  }

  const now = new Date();
  const reviewedStatus =
    input.action === "APPROVE"
      ? AccessRequestStatus.APPROVED
      : input.action === "REJECT"
        ? AccessRequestStatus.REJECTED
        : AccessRequestStatus.CANCELLED;

  const updated = await prisma.$transaction(async (tx) => {
    if (input.action === "APPROVE") {
      const existingMembership = await tx.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: request.requesterId,
            workspaceId: request.workspaceId
          }
        },
        select: { role: true }
      });
      if (!existingMembership) {
        await tx.workspaceMember.create({
          data: {
            userId: request.requesterId,
            workspaceId: request.workspaceId,
            role: request.requestedRole
          }
        });
      }

      if (request.targetType === AccessRequestTargetType.FILE && request.fileId) {
        await tx.fileAccessGrant.upsert({
          where: {
            fileId_userId: {
              fileId: request.fileId,
              userId: request.requesterId
            }
          },
          create: {
            fileId: request.fileId,
            userId: request.requesterId,
            grantedById: input.actorId
          },
          update: {
            grantedById: input.actorId,
            revokedAt: null,
            expiresAt: null
          }
        });
      }
    }

    return tx.accessRequest.update({
      where: { id: request.id },
      data: {
        status: reviewedStatus,
        reviewerId: input.action === "CANCEL" && input.actorId === request.requesterId ? null : input.actorId,
        decisionReason: input.decisionReason?.trim() || null,
        decidedAt: now
      },
      include: {
        workspace: { select: { id: true, name: true } },
        file: { select: { id: true, fileName: true } },
        requester: { select: { name: true, email: true } },
        reviewer: { select: { name: true, email: true } }
      }
    });
  });

  await notifyUsers([request.requesterId], {
    workspaceId: request.workspaceId,
    type: "ACCESS_REQUEST_REVIEWED",
    title:
      input.action === "APPROVE"
        ? "Your access request was approved"
        : input.action === "REJECT"
          ? "Your access request was rejected"
          : "Your access request was cancelled",
    body:
      request.targetType === AccessRequestTargetType.WORKSPACE
        ? request.workspace.name
        : `File access in ${request.workspace.name}`,
    href:
      input.action === "APPROVE"
        ? request.targetType === AccessRequestTargetType.WORKSPACE
          ? `/dashboard/workspaces/${request.workspaceId}`
          : `/api/files/${request.fileId}/preview`
        : "/dashboard/access-requests"
  });

  await logActivity({
    userId: input.actorId,
    workspaceId: request.workspaceId,
    action:
      input.action === "APPROVE"
        ? activityActions.accessRequestApproved
        : input.action === "REJECT"
          ? activityActions.accessRequestRejected
          : activityActions.accessRequestCancelled,
    targetId: request.id,
    metadata: {
      targetType: request.targetType,
      targetId: request.targetId,
      requesterId: request.requesterId
    }
  });

  return updated;
}

export async function getAccessRequestsForUser(userId: string) {
  return prisma.accessRequest.findMany({
    where: { requesterId: userId },
    include: {
      workspace: { select: { id: true, name: true } },
      file: { select: { id: true, fileName: true } },
      requester: { select: { name: true, email: true } },
      reviewer: { select: { name: true, email: true } }
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100
  });
}

export async function getAccessRequestsForReview(userId: string) {
  const workspaceIds = await getReviewableAccessWorkspaceIds(userId);
  if (!workspaceIds.length) return [];

  return prisma.accessRequest.findMany({
    where: { workspaceId: { in: workspaceIds } },
    include: {
      workspace: { select: { id: true, name: true } },
      file: { select: { id: true, fileName: true } },
      requester: { select: { name: true, email: true } },
      reviewer: { select: { name: true, email: true } }
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200
  });
}
