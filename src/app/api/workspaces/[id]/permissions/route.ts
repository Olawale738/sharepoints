import { WorkspaceRole } from "@prisma/client";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { defaultPermissionsForRole, requireWorkspaceAdminAccess } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { updateWorkspaceRolePermissionSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type SavedRolePermissions = Partial<ReturnType<typeof defaultPermissionsForRole>>;

function serializeRolePermissions(role: WorkspaceRole, saved?: SavedRolePermissions) {
  return {
    role,
    ...defaultPermissionsForRole(role),
    canUploadFiles: saved?.canUploadFiles ?? defaultPermissionsForRole(role).canUploadFiles,
    canDeleteFiles: saved?.canDeleteFiles ?? defaultPermissionsForRole(role).canDeleteFiles,
    canCreateFolders: saved?.canCreateFolders ?? defaultPermissionsForRole(role).canCreateFolders,
    canCreateChannels: saved?.canCreateChannels ?? defaultPermissionsForRole(role).canCreateChannels,
    canSendMessages: saved?.canSendMessages ?? defaultPermissionsForRole(role).canSendMessages,
    canManageMembers: saved?.canManageMembers ?? defaultPermissionsForRole(role).canManageMembers,
    canManageIntegrations: saved?.canManageIntegrations ?? defaultPermissionsForRole(role).canManageIntegrations,
    canViewActivity: saved?.canViewActivity ?? defaultPermissionsForRole(role).canViewActivity,
    canCreateAnnouncements:
      saved?.canCreateAnnouncements ?? defaultPermissionsForRole(role).canCreateAnnouncements,
    canManageTasks: saved?.canManageTasks ?? defaultPermissionsForRole(role).canManageTasks,
    canScheduleMeetings: saved?.canScheduleMeetings ?? defaultPermissionsForRole(role).canScheduleMeetings,
    canCreateShareLinks: saved?.canCreateShareLinks ?? defaultPermissionsForRole(role).canCreateShareLinks
  };
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspaceAdminAccess(user.id, id);

    const rows = await prisma.workspaceRolePermission.findMany({
      where: {
        workspaceId: id,
        role: {
          in: [WorkspaceRole.LEADER, WorkspaceRole.MODERATOR]
        }
      }
    });

    return ok({
      permissions: [WorkspaceRole.LEADER, WorkspaceRole.MODERATOR].map((role) => {
        const saved = rows.find((row) => row.role === role);
        return serializeRolePermissions(role, saved ?? undefined);
      })
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspaceAdminAccess(user.id, id);

    const body = await request.json();
    const parsed = updateWorkspaceRolePermissionSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid role permissions.");
    }

    const { role, ...permissions } = parsed.data;
    const updated = await prisma.workspaceRolePermission.upsert({
      where: {
        workspaceId_role: {
          workspaceId: id,
          role
        }
      },
      update: permissions,
      create: {
        workspaceId: id,
        role,
        ...permissions
      }
    });

    await logActivity({
      userId: user.id,
      workspaceId: id,
      action: activityActions.rolePermissionsUpdated,
      targetId: updated.id,
      metadata: { role }
    });

    return ok({ permissions: serializeRolePermissions(role, updated) });
  } catch (error) {
    return handleRouteError(error);
  }
}
