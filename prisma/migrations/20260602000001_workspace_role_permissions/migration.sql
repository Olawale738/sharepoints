ALTER TABLE "WorkspaceMember" ALTER COLUMN "role" SET DEFAULT 'user';

CREATE TABLE "WorkspaceRolePermission" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "canUploadFiles" BOOLEAN NOT NULL DEFAULT false,
    "canDeleteFiles" BOOLEAN NOT NULL DEFAULT false,
    "canCreateFolders" BOOLEAN NOT NULL DEFAULT false,
    "canCreateChannels" BOOLEAN NOT NULL DEFAULT false,
    "canSendMessages" BOOLEAN NOT NULL DEFAULT true,
    "canManageMembers" BOOLEAN NOT NULL DEFAULT false,
    "canManageIntegrations" BOOLEAN NOT NULL DEFAULT false,
    "canViewActivity" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceRolePermission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceRolePermission_workspaceId_role_key" ON "WorkspaceRolePermission"("workspaceId", "role");
CREATE INDEX "WorkspaceRolePermission_workspaceId_idx" ON "WorkspaceRolePermission"("workspaceId");

ALTER TABLE "WorkspaceRolePermission" ADD CONSTRAINT "WorkspaceRolePermission_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "WorkspaceRolePermission" (
    "id",
    "workspaceId",
    "role",
    "canUploadFiles",
    "canDeleteFiles",
    "canCreateFolders",
    "canCreateChannels",
    "canSendMessages",
    "canManageMembers",
    "canManageIntegrations",
    "canViewActivity",
    "updatedAt"
)
SELECT
    'perm_' || "Workspace"."id" || '_leader',
    "Workspace"."id",
    'leader'::"WorkspaceRole",
    true,
    true,
    true,
    true,
    true,
    false,
    false,
    true,
    CURRENT_TIMESTAMP
FROM "Workspace"
ON CONFLICT ("workspaceId", "role") DO NOTHING;

INSERT INTO "WorkspaceRolePermission" (
    "id",
    "workspaceId",
    "role",
    "canUploadFiles",
    "canDeleteFiles",
    "canCreateFolders",
    "canCreateChannels",
    "canSendMessages",
    "canManageMembers",
    "canManageIntegrations",
    "canViewActivity",
    "updatedAt"
)
SELECT
    'perm_' || "Workspace"."id" || '_moderator',
    "Workspace"."id",
    'moderator'::"WorkspaceRole",
    true,
    false,
    true,
    true,
    true,
    false,
    false,
    true,
    CURRENT_TIMESTAMP
FROM "Workspace"
ON CONFLICT ("workspaceId", "role") DO NOTHING;

INSERT INTO "WorkspaceRolePermission" (
    "id",
    "workspaceId",
    "role",
    "canUploadFiles",
    "canDeleteFiles",
    "canCreateFolders",
    "canCreateChannels",
    "canSendMessages",
    "canManageMembers",
    "canManageIntegrations",
    "canViewActivity",
    "updatedAt"
)
SELECT
    'perm_' || "Workspace"."id" || '_user',
    "Workspace"."id",
    'user'::"WorkspaceRole",
    false,
    false,
    false,
    false,
    true,
    false,
    false,
    false,
    CURRENT_TIMESTAMP
FROM "Workspace"
ON CONFLICT ("workspaceId", "role") DO NOTHING;
