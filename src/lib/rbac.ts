import { WorkspaceRole } from "@prisma/client";

import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const permissionKeys = [
  "canUploadFiles",
  "canDeleteFiles",
  "canCreateFolders",
  "canCreateChannels",
  "canSendMessages",
  "canManageMembers",
  "canManageIntegrations",
  "canViewActivity",
  "canCreateAnnouncements",
  "canManageTasks",
  "canCreateShareLinks"
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
  canCreateAnnouncements: true,
  canManageTasks: true,
  canCreateShareLinks: true
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
      canCreateAnnouncements: true,
      canManageTasks: true,
      canCreateShareLinks: true
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
      canCreateAnnouncements: true,
      canManageTasks: true,
      canCreateShareLinks: false
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
    canCreateAnnouncements: false,
    canManageTasks: false,
    canCreateShareLinks: false
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
  const membership = await getWorkspaceMembership(userId, workspaceId);

  if (!membership) {
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

  return membership;
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
    canCreateAnnouncements: saved.canCreateAnnouncements,
    canManageTasks: saved.canManageTasks,
    canCreateShareLinks: saved.canCreateShareLinks
  };
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
      role: WorkspaceRole.ADMIN
    },
    select: {
      id: true
    }
  });

  return Boolean(adminMembership);
}

export async function hasAnyWorkspaceCreatorRole(userId: string) {
  const creatorMembership = await prisma.workspaceMember.findFirst({
    where: {
      userId,
      role: {
        in: [WorkspaceRole.ADMIN, WorkspaceRole.LEADER, WorkspaceRole.EDITOR]
      }
    },
    select: {
      id: true
    }
  });

  return Boolean(creatorMembership);
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
  message = "Only workspace admins and assigned leaders can create new workspaces."
) {
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
