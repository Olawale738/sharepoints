import { MemberSanctionType, WorkspaceRole } from "@prisma/client";

import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireNoSanction } from "@/lib/sanctions";

export const permissionKeys = [
  "canUploadFiles",
  "canDeleteFiles",
  "canCreateFolders",
  "canCreateChannels",
  "canSendMessages",
  "canManageMembers",
  "canManageIntegrations",
  "canViewActivity",
  "canClearActivity",
  "canCreateAnnouncements",
  "canManageTasks",
  "canScheduleMeetings",
  "canCreateShareLinks",
  "canUseWhatsAppCommandBot",
  "canManageDigitalSignatures",
  "canManageEvidenceVault",
  "canViewExecutiveBriefing",
  "canDeleteReports",
  "canClearReportLogs",
  "canManagePresidentialActions",
  "canManageMediaArchive",
  "canUseExecutiveSecretary",
  "canApproveContent",
  "canClassifyDocuments",
  "canViewPresidentDesk",
  "canManageOfficialRegistry",
  "canViewBranchCompliance",
  "canRunSuperAdminRecovery"
] as const;

export type WorkspacePermissionKey = (typeof permissionKeys)[number];

export type WorkspacePermissions = Record<WorkspacePermissionKey, boolean>;

export const allWorkspacePermissions: WorkspacePermissions = {
  canUploadFiles: true,
  canDeleteFiles: true,
  canCreateFolders: true,
  canCreateChannels: true,
  canSendMessages: true,
  canManageMembers: true,
  canManageIntegrations: true,
  canViewActivity: true,
  canClearActivity: true,
  canCreateAnnouncements: true,
  canManageTasks: true,
  canScheduleMeetings: true,
  canCreateShareLinks: true,
  canUseWhatsAppCommandBot: true,
  canManageDigitalSignatures: true,
  canManageEvidenceVault: true,
  canViewExecutiveBriefing: true,
  canDeleteReports: true,
  canClearReportLogs: true,
  canManagePresidentialActions: true,
  canManageMediaArchive: true,
  canUseExecutiveSecretary: true,
  canApproveContent: true,
  canClassifyDocuments: true,
  canViewPresidentDesk: true,
  canManageOfficialRegistry: true,
  canViewBranchCompliance: true,
  canRunSuperAdminRecovery: true
};

export function defaultPermissionsForRole(role: WorkspaceRole | string): WorkspacePermissions {
  if (role === WorkspaceRole.ADMIN) {
    return allWorkspacePermissions;
  }

  if (role === WorkspaceRole.LEADER || role === WorkspaceRole.EDITOR) {
    return {
      canUploadFiles: true,
      canDeleteFiles: true,
      canCreateFolders: true,
      canCreateChannels: true,
      canSendMessages: true,
      canManageMembers: false,
      canManageIntegrations: false,
      canViewActivity: true,
      canClearActivity: false,
      canCreateAnnouncements: true,
      canManageTasks: true,
      canScheduleMeetings: false,
      canCreateShareLinks: true,
      canUseWhatsAppCommandBot: false,
      canManageDigitalSignatures: false,
      canManageEvidenceVault: false,
      canViewExecutiveBriefing: false,
      canDeleteReports: false,
      canClearReportLogs: false,
      canManagePresidentialActions: false,
      canManageMediaArchive: false,
      canUseExecutiveSecretary: false,
      canApproveContent: true,
      canClassifyDocuments: false,
      canViewPresidentDesk: false,
      canManageOfficialRegistry: false,
      canViewBranchCompliance: false,
      canRunSuperAdminRecovery: false
    };
  }

  if (role === WorkspaceRole.MODERATOR) {
    return {
      canUploadFiles: true,
      canDeleteFiles: false,
      canCreateFolders: true,
      canCreateChannels: true,
      canSendMessages: true,
      canManageMembers: false,
      canManageIntegrations: false,
      canViewActivity: true,
      canClearActivity: false,
      canCreateAnnouncements: true,
      canManageTasks: true,
      canScheduleMeetings: false,
      canCreateShareLinks: false,
      canUseWhatsAppCommandBot: false,
      canManageDigitalSignatures: false,
      canManageEvidenceVault: false,
      canViewExecutiveBriefing: false,
      canDeleteReports: false,
      canClearReportLogs: false,
      canManagePresidentialActions: false,
      canManageMediaArchive: false,
      canUseExecutiveSecretary: false,
      canApproveContent: false,
      canClassifyDocuments: false,
      canViewPresidentDesk: false,
      canManageOfficialRegistry: false,
      canViewBranchCompliance: false,
      canRunSuperAdminRecovery: false
    };
  }

  return {
    canUploadFiles: false,
    canDeleteFiles: false,
    canCreateFolders: false,
    canCreateChannels: false,
    canSendMessages: true,
    canManageMembers: false,
    canManageIntegrations: false,
    canViewActivity: false,
    canClearActivity: false,
    canCreateAnnouncements: false,
    canManageTasks: false,
    canScheduleMeetings: false,
    canCreateShareLinks: false,
    canUseWhatsAppCommandBot: false,
    canManageDigitalSignatures: false,
    canManageEvidenceVault: false,
    canViewExecutiveBriefing: false,
    canDeleteReports: false,
    canClearReportLogs: false,
    canManagePresidentialActions: false,
    canManageMediaArchive: false,
    canUseExecutiveSecretary: false,
    canApproveContent: false,
    canClassifyDocuments: false,
    canViewPresidentDesk: false,
    canManageOfficialRegistry: false,
    canViewBranchCompliance: false,
    canRunSuperAdminRecovery: false
  };
}

export async function getWorkspaceMembership(userId: string, workspaceId: string) {
  return prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId,
        workspaceId
      }
    }
  });
}

export async function requireWorkspaceMembership(userId: string, workspaceId: string) {
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, deletedAt: null },
    select: { id: true }
  });
  if (!workspace) {
    throw new ApiError(404, "Workspace not found.");
  }
  const membership = await getWorkspaceMembership(userId, workspaceId);

  if (!membership) {
    const temporaryAccess = await prisma.temporaryWorkspaceAccess.findFirst({
      where: {
        userId,
        workspaceId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        workspace: { deletedAt: null }
      },
      select: {
        id: true,
        userId: true,
        workspaceId: true,
        role: true,
        createdAt: true
      }
    });

    if (temporaryAccess) {
      return {
        id: temporaryAccess.id,
        userId: temporaryAccess.userId,
        workspaceId: temporaryAccess.workspaceId,
        role: temporaryAccess.role,
        joinedAt: temporaryAccess.createdAt
      };
    }

    if (await hasAnyWorkspaceAdminRole(userId)) {
      return {
        id: `global-admin-${workspaceId}`,
        userId,
        workspaceId,
        role: WorkspaceRole.ADMIN,
        joinedAt: new Date(0)
      };
    }

    throw new ApiError(403, "You are not a member of this workspace.");
  }

  if (membership.role !== WorkspaceRole.ADMIN && !(await hasAnyWorkspaceAdminRole(userId))) {
    await requireWorkspaceDepartmentAccess(userId, workspaceId);
  }

  return membership;
}

export async function requireWorkspaceDepartmentAccess(userId: string, workspaceId: string) {
  const restrictedDepartmentsCount = await prisma.workspaceDepartmentAccess.count({
    where: {
      workspaceId,
      canAccessWorkspace: true
    }
  });

  if (!restrictedDepartmentsCount) {
    return true;
  }

  const user = await prisma.user.findUnique({
    where: {
      id: userId
    },
    select: {
      departmentId: true
    }
  });

  if (!user?.departmentId) {
    throw new ApiError(403, "Your department has not been granted access to this workspace.");
  }

  const access = await prisma.workspaceDepartmentAccess.findUnique({
    where: {
      workspaceId_departmentId: {
        workspaceId,
        departmentId: user.departmentId
      }
    },
    select: {
      canAccessWorkspace: true
    }
  });

  if (!access?.canAccessWorkspace) {
    throw new ApiError(403, "Your department has not been granted access to this workspace.");
  }

  return true;
}

export async function requireWorkspaceDepartmentChatAccess(userId: string, workspaceId: string) {
  if (await hasAnyWorkspaceAdminRole(userId)) {
    return true;
  }

  const restrictedDepartmentsCount = await prisma.workspaceDepartmentAccess.count({
    where: {
      workspaceId,
      canAccessChat: true
    }
  });

  if (!restrictedDepartmentsCount) {
    return true;
  }

  const user = await prisma.user.findUnique({
    where: {
      id: userId
    },
    select: {
      departmentId: true
    }
  });

  if (!user?.departmentId) {
    throw new ApiError(403, "Your department has not been granted chat access in this workspace.");
  }

  const access = await prisma.workspaceDepartmentAccess.findUnique({
    where: {
      workspaceId_departmentId: {
        workspaceId,
        departmentId: user.departmentId
      }
    },
    select: {
      canAccessChat: true
    }
  });

  if (!access?.canAccessChat) {
    throw new ApiError(403, "Your department has not been granted chat access in this workspace.");
  }

  return true;
}

export async function getRolePermissions(workspaceId: string, role: WorkspaceRole | string) {
  const defaults = defaultPermissionsForRole(role);

  if (role === WorkspaceRole.ADMIN || role === WorkspaceRole.EDITOR || role === WorkspaceRole.VIEWER) {
    return defaults;
  }

  const saved = await prisma.workspaceRolePermission.findUnique({
    where: {
      workspaceId_role: {
        workspaceId,
        role: role as WorkspaceRole
      }
    }
  });

  if (!saved) {
    return defaults;
  }

  return {
    canUploadFiles: saved.canUploadFiles,
    canDeleteFiles: saved.canDeleteFiles,
    canCreateFolders: saved.canCreateFolders,
    canCreateChannels: saved.canCreateChannels,
    canSendMessages: saved.canSendMessages,
    canManageMembers: saved.canManageMembers,
    canManageIntegrations: saved.canManageIntegrations,
    canViewActivity: saved.canViewActivity,
    canClearActivity: saved.canClearActivity,
    canCreateAnnouncements: saved.canCreateAnnouncements,
    canManageTasks: saved.canManageTasks,
    canScheduleMeetings: saved.canScheduleMeetings,
    canCreateShareLinks: saved.canCreateShareLinks,
    canUseWhatsAppCommandBot: saved.canUseWhatsAppCommandBot,
    canManageDigitalSignatures: saved.canManageDigitalSignatures,
    canManageEvidenceVault: saved.canManageEvidenceVault,
    canViewExecutiveBriefing: saved.canViewExecutiveBriefing,
    canDeleteReports: saved.canDeleteReports,
    canClearReportLogs: saved.canClearReportLogs,
    canManagePresidentialActions: saved.canManagePresidentialActions,
    canManageMediaArchive: saved.canManageMediaArchive,
    canUseExecutiveSecretary: saved.canUseExecutiveSecretary,
    canApproveContent: saved.canApproveContent,
    canClassifyDocuments: saved.canClassifyDocuments,
    canViewPresidentDesk: saved.canViewPresidentDesk,
    canManageOfficialRegistry: saved.canManageOfficialRegistry,
    canViewBranchCompliance: saved.canViewBranchCompliance,
    canRunSuperAdminRecovery: saved.canRunSuperAdminRecovery
  };
}

export async function hasAnyWorkspacePermission(userId: string, permission: WorkspacePermissionKey) {
  if (await hasAnyWorkspaceAdminRole(userId)) return true;
  const memberships = await prisma.workspaceMember.findMany({
    where: {
      userId,
      workspace: { deletedAt: null },
      role: { in: [WorkspaceRole.LEADER, WorkspaceRole.MODERATOR] }
    },
    select: { workspaceId: true, role: true },
    take: 100
  });
  for (const membership of memberships) {
    const permissions = await getRolePermissions(membership.workspaceId, membership.role);
    if (permissions[permission]) return true;
  }
  return false;
}

export async function requireAnyWorkspacePermission(userId: string, permission: WorkspacePermissionKey, message = "Your role cannot perform this action.") {
  if (!(await hasAnyWorkspacePermission(userId, permission))) {
    throw new ApiError(403, message);
  }
}

export async function getUserWorkspacePermissions(userId: string, workspaceId: string) {
  const membership = await requireWorkspaceMembership(userId, workspaceId);
  const permissions = await getRolePermissions(workspaceId, membership.role);

  return {
    membership,
    permissions
  };
}

export async function requireWorkspaceRole(
  userId: string,
  workspaceId: string,
  allowedRoles: WorkspaceRole[]
) {
  const membership = await requireWorkspaceMembership(userId, workspaceId);

  if (!allowedRoles.includes(membership.role)) {
    throw new ApiError(403, "Your role cannot perform this action.");
  }

  return membership;
}

export async function requireWorkspaceAdmin(userId: string, workspaceId: string) {
  return requireWorkspaceRole(userId, workspaceId, [WorkspaceRole.ADMIN]);
}

export async function hasWorkspaceAdminAccess(userId: string, workspaceId: string) {
  const membership = await getWorkspaceMembership(userId, workspaceId);

  if (membership?.role === WorkspaceRole.ADMIN) {
    return true;
  }

  return hasAnyWorkspaceAdminRole(userId);
}

export async function requireWorkspaceAdminAccess(
  userId: string,
  workspaceId: string,
  message = "Only admins can perform this action."
) {
  if (!(await hasWorkspaceAdminAccess(userId, workspaceId))) {
    throw new ApiError(403, message);
  }
}

export async function requireWorkspaceMemberManager(userId: string, workspaceId: string) {
  const membership = await getWorkspaceMembership(userId, workspaceId);

  if (membership) {
    const permissions = await getRolePermissions(workspaceId, membership.role);

    if (permissions.canManageMembers) {
      return {
        membership,
        isAdminAccess: membership.role === WorkspaceRole.ADMIN
      };
    }
  }

  if (await hasAnyWorkspaceAdminRole(userId)) {
    return {
      membership,
      isAdminAccess: true
    };
  }

  throw new ApiError(403, "Only admins can manage workspace members.");
}

export async function hasAnyWorkspaceAdminRole(userId: string) {
  const adminMembership = await prisma.workspaceMember.findFirst({
    where: {
      userId,
      role: WorkspaceRole.ADMIN,
      workspace: {
        deletedAt: null
      }
    },
    select: {
      id: true
    }
  });

  return Boolean(adminMembership);
}

export async function hasAnyWorkspaceCreatorRole(userId: string) {
  const [creatorMembership, organizationLeadership] = await Promise.all([
    prisma.workspaceMember.findFirst({
      where: {
        userId,
        role: WorkspaceRole.ADMIN,
        workspace: {
          deletedAt: null
        }
      },
      select: {
        id: true
      }
    }),
    prisma.organizationUnitLeader.findFirst({
      where: {
        userId,
        canCreateWorkspaces: true
      },
      select: {
        id: true
      }
    })
  ]);

  return Boolean(creatorMembership || organizationLeadership);
}

export async function requireAnyWorkspaceAdmin(
  userId: string,
  message = "Only workspace admins can perform this action."
) {
  if (!(await hasAnyWorkspaceAdminRole(userId))) {
    throw new ApiError(403, message);
  }
}

export async function requireWorkspaceCreatorRole(
  userId: string,
  message = "Only administrators and leaders explicitly assigned to a church network scope can create workspaces."
) {
  await requireNoSanction(
    userId,
    [MemberSanctionType.RESTRICT_FILES],
    "Your account is temporarily restricted from creating collaboration spaces."
  );
  if (!(await hasAnyWorkspaceCreatorRole(userId))) {
    throw new ApiError(403, message);
  }
}

export async function requireWorkspacePermission(
  userId: string,
  workspaceId: string,
  permission: WorkspacePermissionKey
) {
  const membership = await requireWorkspaceMembership(userId, workspaceId);

  if (membership.role === WorkspaceRole.ADMIN || (await hasAnyWorkspaceAdminRole(userId))) {
    return {
      membership,
      permissions: allWorkspacePermissions
    };
  }

  if (permission === "canSendMessages") {
    await requireNoSanction(
      userId,
      [MemberSanctionType.RESTRICT_CHAT],
      "Your chat access is temporarily restricted. Contact an administrator."
    );
  }
  if (["canUploadFiles", "canDeleteFiles", "canCreateFolders", "canCreateShareLinks"].includes(permission)) {
    await requireNoSanction(
      userId,
      [MemberSanctionType.RESTRICT_FILES],
      "Your file collaboration access is temporarily restricted. Contact an administrator."
    );
  }

  const permissions = await getRolePermissions(workspaceId, membership.role);

  if (!permissions[permission]) {
    throw new ApiError(403, "Your role cannot perform this action.");
  }

  return {
    membership,
    permissions
  };
}

export function canWriteFiles(role: WorkspaceRole | string) {
  const permissions = defaultPermissionsForRole(role);
  return permissions.canUploadFiles || permissions.canDeleteFiles || permissions.canCreateFolders;
}
