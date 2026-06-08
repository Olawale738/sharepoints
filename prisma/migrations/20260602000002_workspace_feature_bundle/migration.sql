CREATE TYPE "TaskStatus" AS ENUM ('todo', 'in_progress', 'blocked', 'done');

ALTER TABLE "WorkspaceRolePermission" ADD COLUMN "canCreateAnnouncements" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkspaceRolePermission" ADD COLUMN "canManageTasks" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "WorkspaceRolePermission" ADD COLUMN "canCreateShareLinks" BOOLEAN NOT NULL DEFAULT false;

UPDATE "WorkspaceRolePermission"
SET
  "canCreateAnnouncements" = true,
  "canManageTasks" = true,
  "canCreateShareLinks" = true
WHERE "role" = 'leader';

UPDATE "WorkspaceRolePermission"
SET
  "canCreateAnnouncements" = true,
  "canManageTasks" = true,
  "canCreateShareLinks" = false
WHERE "role" = 'moderator';

CREATE TABLE "WorkspaceAnnouncement" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceAnnouncement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WorkspaceTask" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'todo',
    "dueDate" TIMESTAMP(3),
    "assignedToId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceTask_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FileShareLink" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileShareLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkspaceAnnouncement_workspaceId_pinned_createdAt_idx" ON "WorkspaceAnnouncement"("workspaceId", "pinned", "createdAt");
CREATE INDEX "WorkspaceAnnouncement_authorId_createdAt_idx" ON "WorkspaceAnnouncement"("authorId", "createdAt");

CREATE INDEX "WorkspaceTask_workspaceId_status_dueDate_idx" ON "WorkspaceTask"("workspaceId", "status", "dueDate");
CREATE INDEX "WorkspaceTask_assignedToId_status_idx" ON "WorkspaceTask"("assignedToId", "status");
CREATE INDEX "WorkspaceTask_createdById_createdAt_idx" ON "WorkspaceTask"("createdById", "createdAt");

CREATE UNIQUE INDEX "FileShareLink_token_key" ON "FileShareLink"("token");
CREATE INDEX "FileShareLink_fileId_createdAt_idx" ON "FileShareLink"("fileId", "createdAt");
CREATE INDEX "FileShareLink_expiresAt_idx" ON "FileShareLink"("expiresAt");

ALTER TABLE "WorkspaceAnnouncement" ADD CONSTRAINT "WorkspaceAnnouncement_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceAnnouncement" ADD CONSTRAINT "WorkspaceAnnouncement_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "WorkspaceTask" ADD CONSTRAINT "WorkspaceTask_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceTask" ADD CONSTRAINT "WorkspaceTask_assignedToId_fkey"
FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "WorkspaceTask" ADD CONSTRAINT "WorkspaceTask_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "FileShareLink" ADD CONSTRAINT "FileShareLink_fileId_fkey"
FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FileShareLink" ADD CONSTRAINT "FileShareLink_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
