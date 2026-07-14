-- CreateEnum
CREATE TYPE "PresidentialApprovalTargetType" AS ENUM (
  'OFFICIAL_LETTER',
  'CERTIFICATE',
  'ID_CARD',
  'LEADERSHIP_APPOINTMENT',
  'SENSITIVE_FILE',
  'FINANCIAL_APPROVAL'
);

-- CreateTable
CREATE TABLE "PresidentApprovalWallPolicy" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "requireOfficialLetters" BOOLEAN NOT NULL DEFAULT true,
  "requireCertificates" BOOLEAN NOT NULL DEFAULT true,
  "requireIdCards" BOOLEAN NOT NULL DEFAULT true,
  "requireLeadershipAppointments" BOOLEAN NOT NULL DEFAULT true,
  "requireSensitiveFiles" BOOLEAN NOT NULL DEFAULT true,
  "requireFinancialApprovals" BOOLEAN NOT NULL DEFAULT true,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PresidentApprovalWallPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresidentEmergencyLockdown" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
  "active" BOOLEAN NOT NULL DEFAULT false,
  "lockDownloads" BOOLEAN NOT NULL DEFAULT false,
  "lockNewLogins" BOOLEAN NOT NULL DEFAULT false,
  "freezeDocumentChanges" BOOLEAN NOT NULL DEFAULT false,
  "disableOfficialIssuing" BOOLEAN NOT NULL DEFAULT false,
  "lockWorkspaceActions" BOOLEAN NOT NULL DEFAULT false,
  "lockFinancialActions" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT,
  "activatedById" TEXT,
  "activatedAt" TIMESTAMP(3),
  "deactivatedById" TEXT,
  "deactivatedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PresidentEmergencyLockdown_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresidentialApprovalItem" (
  "id" TEXT NOT NULL,
  "targetType" "PresidentialApprovalTargetType" NOT NULL,
  "targetId" TEXT,
  "workspaceId" TEXT,
  "organizationUnitId" TEXT,
  "requesterId" TEXT NOT NULL,
  "reviewerId" TEXT,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "payload" JSONB,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PresidentialApprovalItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PresidentApprovalWallPolicy_scope_key" ON "PresidentApprovalWallPolicy"("scope");

-- CreateIndex
CREATE UNIQUE INDEX "PresidentEmergencyLockdown_scope_key" ON "PresidentEmergencyLockdown"("scope");

-- CreateIndex
CREATE INDEX "PresidentialApprovalItem_targetType_status_createdAt_idx" ON "PresidentialApprovalItem"("targetType", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PresidentialApprovalItem_workspaceId_status_createdAt_idx" ON "PresidentialApprovalItem"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PresidentialApprovalItem_organizationUnitId_status_createdAt_idx" ON "PresidentialApprovalItem"("organizationUnitId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PresidentialApprovalItem_requesterId_createdAt_idx" ON "PresidentialApprovalItem"("requesterId", "createdAt");

-- CreateIndex
CREATE INDEX "PresidentialApprovalItem_reviewerId_reviewedAt_idx" ON "PresidentialApprovalItem"("reviewerId", "reviewedAt");
