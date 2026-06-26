CREATE TYPE "ChurchProjectType" AS ENUM ('BUILDING', 'MISSION', 'OUTREACH', 'CRUSADE', 'ADMINISTRATIVE', 'OTHER');
CREATE TYPE "ChurchProjectStatus" AS ENUM ('PLANNING', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED');
CREATE TYPE "BudgetLineStatus" AS ENUM ('REQUESTED', 'APPROVED', 'PAID', 'REJECTED');
CREATE TYPE "CounsellingCaseStatus" AS ENUM ('OPEN', 'ACTIVE', 'FOLLOW_UP', 'CLOSED');
CREATE TYPE "CounsellingSensitivity" AS ENUM ('PASTORAL', 'SAFEGUARDING', 'HIGHLY_RESTRICTED');
CREATE TYPE "SmartAttendanceTargetType" AS ENUM ('SERVICE', 'MEETING', 'EVENT');
CREATE TYPE "DocumentExpiryTargetType" AS ENUM ('FILE', 'POLICY', 'CERTIFICATE', 'FORM', 'PERMIT', 'OTHER');
CREATE TYPE "DocumentExpiryStatus" AS ENUM ('ACTIVE', 'REVIEW_DUE', 'EXPIRED', 'RENEWED', 'ARCHIVED');
CREATE TYPE "NewsAudienceType" AS ENUM ('LETW_WIDE', 'ORGANIZATION_UNIT', 'WORKSPACE', 'LEADERSHIP');
CREATE TYPE "NewsReactionType" AS ENUM ('LIKE', 'AMEN', 'PRAYING', 'CELEBRATE');
CREATE TYPE "BranchTransferStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

ALTER TABLE "MemberProfile"
ADD COLUMN "currentOrganizationUnitId" TEXT;

CREATE INDEX "MemberProfile_currentOrganizationUnitId_idx" ON "MemberProfile"("currentOrganizationUnitId");

CREATE TABLE "ChurchProject" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "organizationUnitId" TEXT,
  "ministryId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "projectType" "ChurchProjectType" NOT NULL,
  "status" "ChurchProjectStatus" NOT NULL DEFAULT 'PLANNING',
  "budgetAmount" INTEGER,
  "budgetCurrency" TEXT NOT NULL DEFAULT 'GBP',
  "startsAt" TIMESTAMP(3),
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "ownerId" TEXT,
  "createdById" TEXT NOT NULL,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChurchProject_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ChurchProject_workspaceId_status_dueAt_idx" ON "ChurchProject"("workspaceId", "status", "dueAt");
CREATE INDEX "ChurchProject_organizationUnitId_status_idx" ON "ChurchProject"("organizationUnitId", "status");
CREATE INDEX "ChurchProject_ownerId_status_idx" ON "ChurchProject"("ownerId", "status");
CREATE INDEX "ChurchProject_projectType_status_idx" ON "ChurchProject"("projectType", "status");

CREATE TABLE "ChurchProjectTask" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "TaskStatus" NOT NULL DEFAULT 'todo',
  "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
  "dueDate" TIMESTAMP(3),
  "assignedToId" TEXT,
  "createdById" TEXT NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChurchProjectTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ChurchProjectTask_projectId_status_dueDate_idx" ON "ChurchProjectTask"("projectId", "status", "dueDate");
CREATE INDEX "ChurchProjectTask_assignedToId_status_idx" ON "ChurchProjectTask"("assignedToId", "status");

CREATE TABLE "ChurchProjectBudgetLine" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT,
  "amount" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'GBP',
  "status" "BudgetLineStatus" NOT NULL DEFAULT 'REQUESTED',
  "approvedById" TEXT,
  "paidAt" TIMESTAMP(3),
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChurchProjectBudgetLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ChurchProjectBudgetLine_projectId_status_idx" ON "ChurchProjectBudgetLine"("projectId", "status");
CREATE INDEX "ChurchProjectBudgetLine_createdById_createdAt_idx" ON "ChurchProjectBudgetLine"("createdById", "createdAt");

CREATE TABLE "ChurchProjectDocument" (
  "id" TEXT NOT NULL,
  "projectId" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "title" TEXT,
  "notes" TEXT,
  "addedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChurchProjectDocument_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ChurchProjectDocument_projectId_fileId_key" ON "ChurchProjectDocument"("projectId", "fileId");
CREATE INDEX "ChurchProjectDocument_fileId_idx" ON "ChurchProjectDocument"("fileId");

CREATE TABLE "CounsellingCase" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "organizationUnitId" TEXT,
  "subjectUserId" TEXT,
  "subjectName" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "status" "CounsellingCaseStatus" NOT NULL DEFAULT 'OPEN',
  "sensitivity" "CounsellingSensitivity" NOT NULL DEFAULT 'PASTORAL',
  "summary" TEXT NOT NULL,
  "assignedToId" TEXT,
  "createdById" TEXT NOT NULL,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CounsellingCase_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CounsellingCase_workspaceId_status_idx" ON "CounsellingCase"("workspaceId", "status");
CREATE INDEX "CounsellingCase_organizationUnitId_status_idx" ON "CounsellingCase"("organizationUnitId", "status");
CREATE INDEX "CounsellingCase_assignedToId_status_idx" ON "CounsellingCase"("assignedToId", "status");
CREATE INDEX "CounsellingCase_subjectUserId_status_idx" ON "CounsellingCase"("subjectUserId", "status");

CREATE TABLE "CounsellingNote" (
  "id" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "restricted" BOOLEAN NOT NULL DEFAULT true,
  "nextContactAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CounsellingNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CounsellingNote_caseId_createdAt_idx" ON "CounsellingNote"("caseId", "createdAt");
CREATE INDEX "CounsellingNote_authorId_createdAt_idx" ON "CounsellingNote"("authorId", "createdAt");

CREATE TABLE "SmartAttendanceSession" (
  "id" TEXT NOT NULL,
  "targetType" "SmartAttendanceTargetType" NOT NULL,
  "targetId" TEXT,
  "workspaceId" TEXT,
  "organizationUnitId" TEXT,
  "title" TEXT NOT NULL,
  "qrToken" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SmartAttendanceSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SmartAttendanceSession_qrToken_key" ON "SmartAttendanceSession"("qrToken");
CREATE INDEX "SmartAttendanceSession_targetType_targetId_idx" ON "SmartAttendanceSession"("targetType", "targetId");
CREATE INDEX "SmartAttendanceSession_workspaceId_active_idx" ON "SmartAttendanceSession"("workspaceId", "active");
CREATE INDEX "SmartAttendanceSession_organizationUnitId_active_idx" ON "SmartAttendanceSession"("organizationUnitId", "active");
CREATE INDEX "SmartAttendanceSession_active_startsAt_idx" ON "SmartAttendanceSession"("active", "startsAt");

CREATE TABLE "SmartAttendanceRecord" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT,
  "displayName" TEXT NOT NULL,
  "email" TEXT,
  "method" TEXT NOT NULL DEFAULT 'QR',
  "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes" TEXT,
  CONSTRAINT "SmartAttendanceRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SmartAttendanceRecord_sessionId_userId_key" ON "SmartAttendanceRecord"("sessionId", "userId");
CREATE INDEX "SmartAttendanceRecord_sessionId_checkedInAt_idx" ON "SmartAttendanceRecord"("sessionId", "checkedInAt");
CREATE INDEX "SmartAttendanceRecord_userId_checkedInAt_idx" ON "SmartAttendanceRecord"("userId", "checkedInAt");

CREATE TABLE "DocumentExpiryItem" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "targetType" "DocumentExpiryTargetType" NOT NULL,
  "targetId" TEXT,
  "title" TEXT NOT NULL,
  "ownerId" TEXT,
  "reviewDueAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "status" "DocumentExpiryStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentExpiryItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DocumentExpiryItem_workspaceId_status_reviewDueAt_idx" ON "DocumentExpiryItem"("workspaceId", "status", "reviewDueAt");
CREATE INDEX "DocumentExpiryItem_targetType_targetId_idx" ON "DocumentExpiryItem"("targetType", "targetId");
CREATE INDEX "DocumentExpiryItem_ownerId_status_idx" ON "DocumentExpiryItem"("ownerId", "status");
CREATE INDEX "DocumentExpiryItem_expiresAt_status_idx" ON "DocumentExpiryItem"("expiresAt", "status");

CREATE TABLE "InternalNewsPost" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "organizationUnitId" TEXT,
  "audienceType" "NewsAudienceType" NOT NULL DEFAULT 'LETW_WIDE',
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "commentsEnabled" BOOLEAN NOT NULL DEFAULT true,
  "authorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InternalNewsPost_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InternalNewsPost_audienceType_createdAt_idx" ON "InternalNewsPost"("audienceType", "createdAt");
CREATE INDEX "InternalNewsPost_workspaceId_createdAt_idx" ON "InternalNewsPost"("workspaceId", "createdAt");
CREATE INDEX "InternalNewsPost_organizationUnitId_createdAt_idx" ON "InternalNewsPost"("organizationUnitId", "createdAt");
CREATE INDEX "InternalNewsPost_pinned_createdAt_idx" ON "InternalNewsPost"("pinned", "createdAt");

CREATE TABLE "InternalNewsComment" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InternalNewsComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InternalNewsComment_postId_createdAt_idx" ON "InternalNewsComment"("postId", "createdAt");
CREATE INDEX "InternalNewsComment_authorId_createdAt_idx" ON "InternalNewsComment"("authorId", "createdAt");

CREATE TABLE "InternalNewsReaction" (
  "id" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "reaction" "NewsReactionType" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InternalNewsReaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InternalNewsReaction_postId_userId_reaction_key" ON "InternalNewsReaction"("postId", "userId", "reaction");
CREATE INDEX "InternalNewsReaction_postId_reaction_idx" ON "InternalNewsReaction"("postId", "reaction");
CREATE INDEX "InternalNewsReaction_userId_createdAt_idx" ON "InternalNewsReaction"("userId", "createdAt");

CREATE TABLE "BranchTransferRequest" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "fromUnitId" TEXT,
  "toUnitId" TEXT NOT NULL,
  "status" "BranchTransferStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "requestedById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BranchTransferRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BranchTransferRequest_userId_status_createdAt_idx" ON "BranchTransferRequest"("userId", "status", "createdAt");
CREATE INDEX "BranchTransferRequest_toUnitId_status_idx" ON "BranchTransferRequest"("toUnitId", "status");
CREATE INDEX "BranchTransferRequest_fromUnitId_status_idx" ON "BranchTransferRequest"("fromUnitId", "status");
