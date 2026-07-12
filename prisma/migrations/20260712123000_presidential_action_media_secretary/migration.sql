CREATE TYPE "PresidentialActionStatus" AS ENUM ('PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'ASSIGNED', 'COMPLETED', 'ARCHIVED');

CREATE TYPE "PresidentialActionPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT', 'CRITICAL');

CREATE TYPE "MediaArchiveType" AS ENUM ('VIDEO', 'AUDIO', 'DOCUMENT', 'IMAGE', 'LINK');

ALTER TABLE "WorkspaceRolePermission"
  ADD COLUMN "canManagePresidentialActions" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canManageMediaArchive" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "canUseExecutiveSecretary" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "PresidentialActionItem" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "organizationUnitId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'EXECUTIVE',
  "priority" "PresidentialActionPriority" NOT NULL DEFAULT 'HIGH',
  "status" "PresidentialActionStatus" NOT NULL DEFAULT 'PENDING',
  "sourceType" TEXT,
  "sourceId" TEXT,
  "assignedToId" TEXT,
  "dueAt" TIMESTAMP(3),
  "decisionNote" TEXT,
  "createdById" TEXT NOT NULL,
  "decidedById" TEXT,
  "decidedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PresidentialActionItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PresidentialActionItem_status_priority_dueAt_idx" ON "PresidentialActionItem"("status", "priority", "dueAt");
CREATE INDEX "PresidentialActionItem_assignedToId_status_dueAt_idx" ON "PresidentialActionItem"("assignedToId", "status", "dueAt");
CREATE INDEX "PresidentialActionItem_workspaceId_status_priority_idx" ON "PresidentialActionItem"("workspaceId", "status", "priority");
CREATE INDEX "PresidentialActionItem_organizationUnitId_status_priority_idx" ON "PresidentialActionItem"("organizationUnitId", "status", "priority");
CREATE INDEX "PresidentialActionItem_sourceType_sourceId_idx" ON "PresidentialActionItem"("sourceType", "sourceId");
CREATE INDEX "PresidentialActionItem_createdById_createdAt_idx" ON "PresidentialActionItem"("createdById", "createdAt");

ALTER TABLE "SermonResource"
  ADD COLUMN "mediaType" "MediaArchiveType" NOT NULL DEFAULT 'LINK',
  ADD COLUMN "mediaStorageKey" TEXT,
  ADD COLUMN "mediaFileName" TEXT,
  ADD COLUMN "mediaFileType" TEXT,
  ADD COLUMN "mediaSize" INTEGER,
  ADD COLUMN "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "isFeatured" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "retentionLabel" TEXT,
  ADD COLUMN "transcript" TEXT,
  ADD COLUMN "transcriptSummary" TEXT;

UPDATE "SermonResource"
SET "approvalStatus" = 'APPROVED',
    "mediaType" = CASE
      WHEN "mediaUrl" ILIKE '%.mp4%' OR "mediaUrl" ILIKE '%.mov%' OR "mediaUrl" ILIKE '%youtube%' OR "mediaUrl" ILIKE '%vimeo%' THEN 'VIDEO'::"MediaArchiveType"
      WHEN "mediaUrl" ILIKE '%.mp3%' OR "mediaUrl" ILIKE '%.wav%' OR "mediaUrl" ILIKE '%.m4a%' THEN 'AUDIO'::"MediaArchiveType"
      WHEN "mediaUrl" ILIKE '%.pdf%' OR "mediaUrl" ILIKE '%.doc%' THEN 'DOCUMENT'::"MediaArchiveType"
      ELSE 'LINK'::"MediaArchiveType"
    END;

CREATE INDEX "SermonResource_approvalStatus_visibility_createdAt_idx" ON "SermonResource"("approvalStatus", "visibility", "createdAt");
CREATE INDEX "SermonResource_mediaType_approvalStatus_idx" ON "SermonResource"("mediaType", "approvalStatus");
