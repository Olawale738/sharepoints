-- Add granular authority permissions for leaders and moderators.
ALTER TABLE "WorkspaceRolePermission"
  ADD COLUMN "canApproveContent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canClassifyDocuments" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canViewPresidentDesk" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canManageOfficialRegistry" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canViewBranchCompliance" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canRunSuperAdminRecovery" BOOLEAN NOT NULL DEFAULT false;

-- Add document classification and controlled sharing/download metadata.
ALTER TABLE "File"
  ADD COLUMN "sensitivityLabel" TEXT NOT NULL DEFAULT 'INTERNAL',
  ADD COLUMN "downloadRestricted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "shareRestricted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "aiRestricted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "classifiedById" TEXT,
  ADD COLUMN "classifiedAt" TIMESTAMP(3);

ALTER TABLE "File"
  ADD CONSTRAINT "File_classifiedById_fkey"
  FOREIGN KEY ("classifiedById")
  REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

CREATE INDEX "File_sensitivityLabel_idx" ON "File"("sensitivityLabel");
CREATE INDEX "File_downloadRestricted_idx" ON "File"("downloadRestricted");
CREATE INDEX "File_shareRestricted_idx" ON "File"("shareRestricted");
CREATE INDEX "File_aiRestricted_idx" ON "File"("aiRestricted");
CREATE INDEX "File_classifiedById_idx" ON "File"("classifiedById");
