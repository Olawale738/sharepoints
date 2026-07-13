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
  const defaults = defaultPermissionsForRole(role);

  return {
    role,
    ...defaults,
    canUploadFiles: saved?.canUploadFiles ?? defaults.canUploadFiles,
    canDeleteFiles: saved?.canDeleteFiles ?? defaults.canDeleteFiles,
    canCreateFolders: saved?.canCreateFolders ?? defaults.canCreateFolders,
    canCreateChannels: saved?.canCreateChannels ?? defaults.canCreateChannels,
    canSendMessages: saved?.canSendMessages ?? defaults.canSendMessages,
    canManageMembers: saved?.canManageMembers ?? defaults.canManageMembers,
    canManageIntegrations: saved?.canManageIntegrations ?? defaults.canManageIntegrations,
    canViewActivity: saved?.canViewActivity ?? defaults.canViewActivity,
    canClearActivity: saved?.canClearActivity ?? defaults.canClearActivity,
    canCreateAnnouncements: saved?.canCreateAnnouncements ?? defaults.canCreateAnnouncements,
    canManageTasks: saved?.canManageTasks ?? defaults.canManageTasks,
    canScheduleMeetings: saved?.canScheduleMeetings ?? defaults.canScheduleMeetings,
    canCreateShareLinks: saved?.canCreateShareLinks ?? defaults.canCreateShareLinks,
    canUseWhatsAppCommandBot: saved?.canUseWhatsAppCommandBot ?? defaults.canUseWhatsAppCommandBot,
    canManageDigitalSignatures: saved?.canManageDigitalSignatures ?? defaults.canManageDigitalSignatures,
    canManageEvidenceVault: saved?.canManageEvidenceVault ?? defaults.canManageEvidenceVault,
    canViewExecutiveBriefing: saved?.canViewExecutiveBriefing ?? defaults.canViewExecutiveBriefing,
    canDeleteReports: saved?.canDeleteReports ?? defaults.canDeleteReports,
    canClearReportLogs: saved?.canClearReportLogs ?? defaults.canClearReportLogs,
    canManagePresidentialActions: saved?.canManagePresidentialActions ?? defaults.canManagePresidentialActions,
    canManageMediaArchive: saved?.canManageMediaArchive ?? defaults.canManageMediaArchive,
    canUseExecutiveSecretary: saved?.canUseExecutiveSecretary ?? defaults.canUseExecutiveSecretary,
    canApproveContent: saved?.canApproveContent ?? defaults.canApproveContent,
    canClassifyDocuments: saved?.canClassifyDocuments ?? defaults.canClassifyDocuments,
    canViewPresidentDesk: saved?.canViewPresidentDesk ?? defaults.canViewPresidentDesk,
    canManageOfficialRegistry: saved?.canManageOfficialRegistry ?? defaults.canManageOfficialRegistry,
    canViewBranchCompliance: saved?.canViewBranchCompliance ?? defaults.canViewBranchCompliance,
    canRunSuperAdminRecovery: saved?.canRunSuperAdminRecovery ?? defaults.canRunSuperAdminRecovery
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
