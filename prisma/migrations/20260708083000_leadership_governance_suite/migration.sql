CREATE TYPE "LeadershipDecisionStatus" AS ENUM ('PENDING', 'APPROVED', 'IMPLEMENTED', 'DELAYED', 'CANCELLED');

CREATE TYPE "LeadershipDecisionSource" AS ENUM ('PRESIDENT', 'PASTORS', 'LEADERS', 'BOARD', 'COMMITTEE');

CREATE TYPE "MonthlyReportStatus" AS ENUM ('DRAFT', 'GENERATED', 'FINAL', 'ARCHIVED');

CREATE TYPE "ConfidentialVaultRecordType" AS ENUM ('PRAYER', 'COUNSELLING', 'SAFEGUARDING');

CREATE TYPE "ConfidentialVaultStatus" AS ENUM ('OPEN', 'ACTIVE', 'CLOSED', 'ARCHIVED');

CREATE TYPE "LeadershipHandoverStatus" AS ENUM ('DRAFT', 'PENDING_ACCEPTANCE', 'ACCEPTED', 'COMPLETED', 'CANCELLED');

CREATE TYPE "OfficialLetterType" AS ENUM ('APPOINTMENT', 'TRANSFER', 'ORDINATION', 'RECOMMENDATION', 'INVITATION', 'MEMBERSHIP_CONFIRMATION');

CREATE TYPE "OfficialLetterStatus" AS ENUM ('DRAFT', 'ISSUED', 'REVOKED', 'ARCHIVED');

CREATE TABLE "LeadershipDecision" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "organizationUnitId" TEXT,
  "source" "LeadershipDecisionSource" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "meetingNotes" TEXT,
  "attachments" JSONB,
  "status" "LeadershipDecisionStatus" NOT NULL DEFAULT 'PENDING',
  "responsibleUserId" TEXT,
  "decidedById" TEXT,
  "dueAt" TIMESTAMP(3),
  "implementedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LeadershipDecision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeadershipDecision_workspaceId_status_dueAt_idx" ON "LeadershipDecision"("workspaceId", "status", "dueAt");
CREATE INDEX "LeadershipDecision_organizationUnitId_status_dueAt_idx" ON "LeadershipDecision"("organizationUnitId", "status", "dueAt");
CREATE INDEX "LeadershipDecision_responsibleUserId_status_dueAt_idx" ON "LeadershipDecision"("responsibleUserId", "status", "dueAt");
CREATE INDEX "LeadershipDecision_source_status_idx" ON "LeadershipDecision"("source", "status");

CREATE TABLE "MonthlyMinistryReport" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "organizationUnitId" TEXT,
  "reportType" TEXT NOT NULL DEFAULT 'MONTHLY_BRANCH',
  "month" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "metrics" JSONB NOT NULL,
  "risks" JSONB,
  "sourceSnapshot" JSONB,
  "status" "MonthlyReportStatus" NOT NULL DEFAULT 'GENERATED',
  "generatedById" TEXT NOT NULL,
  "finalizedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "MonthlyMinistryReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MonthlyMinistryReport_organizationUnitId_year_month_idx" ON "MonthlyMinistryReport"("organizationUnitId", "year", "month");
CREATE INDEX "MonthlyMinistryReport_workspaceId_year_month_idx" ON "MonthlyMinistryReport"("workspaceId", "year", "month");
CREATE INDEX "MonthlyMinistryReport_status_createdAt_idx" ON "MonthlyMinistryReport"("status", "createdAt");

CREATE TABLE "ConfidentialVaultRecord" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "organizationUnitId" TEXT,
  "recordType" "ConfidentialVaultRecordType" NOT NULL,
  "title" TEXT NOT NULL,
  "subjectName" TEXT NOT NULL,
  "subjectUserId" TEXT,
  "sensitivity" TEXT NOT NULL DEFAULT 'TOP_PASTORS_ONLY',
  "body" TEXT NOT NULL,
  "prayerPoints" TEXT,
  "assignedToId" TEXT,
  "status" "ConfidentialVaultStatus" NOT NULL DEFAULT 'OPEN',
  "createdById" TEXT NOT NULL,
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ConfidentialVaultRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConfidentialVaultRecord_recordType_status_createdAt_idx" ON "ConfidentialVaultRecord"("recordType", "status", "createdAt");
CREATE INDEX "ConfidentialVaultRecord_organizationUnitId_status_idx" ON "ConfidentialVaultRecord"("organizationUnitId", "status");
CREATE INDEX "ConfidentialVaultRecord_workspaceId_status_idx" ON "ConfidentialVaultRecord"("workspaceId", "status");
CREATE INDEX "ConfidentialVaultRecord_subjectUserId_status_idx" ON "ConfidentialVaultRecord"("subjectUserId", "status");
CREATE INDEX "ConfidentialVaultRecord_assignedToId_status_idx" ON "ConfidentialVaultRecord"("assignedToId", "status");

CREATE TABLE "ConfidentialVaultAccessLog" (
  "id" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ConfidentialVaultAccessLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConfidentialVaultAccessLog_recordId_createdAt_idx" ON "ConfidentialVaultAccessLog"("recordId", "createdAt");
CREATE INDEX "ConfidentialVaultAccessLog_userId_createdAt_idx" ON "ConfidentialVaultAccessLog"("userId", "createdAt");
CREATE INDEX "ConfidentialVaultAccessLog_action_createdAt_idx" ON "ConfidentialVaultAccessLog"("action", "createdAt");

CREATE TABLE "LeadershipHandover" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "organizationUnitId" TEXT,
  "fromLeaderId" TEXT NOT NULL,
  "toLeaderId" TEXT,
  "title" TEXT NOT NULL,
  "reason" TEXT,
  "duties" JSONB,
  "documents" JSONB,
  "passwordAssets" JSONB,
  "pendingTasks" JSONB,
  "branchRecords" JSONB,
  "status" "LeadershipHandoverStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LeadershipHandover_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeadershipHandover_fromLeaderId_status_idx" ON "LeadershipHandover"("fromLeaderId", "status");
CREATE INDEX "LeadershipHandover_toLeaderId_status_idx" ON "LeadershipHandover"("toLeaderId", "status");
CREATE INDEX "LeadershipHandover_organizationUnitId_status_idx" ON "LeadershipHandover"("organizationUnitId", "status");
CREATE INDEX "LeadershipHandover_workspaceId_status_idx" ON "LeadershipHandover"("workspaceId", "status");

CREATE TABLE "OfficialLetter" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "organizationUnitId" TEXT,
  "letterType" "OfficialLetterType" NOT NULL,
  "letterNumber" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "recipientUserId" TEXT,
  "recipientName" TEXT NOT NULL,
  "recipientEmail" TEXT,
  "body" TEXT NOT NULL,
  "signatureName" TEXT NOT NULL DEFAULT 'Olawale N Sanni',
  "status" "OfficialLetterStatus" NOT NULL DEFAULT 'DRAFT',
  "issuedById" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OfficialLetter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OfficialLetter_letterNumber_key" ON "OfficialLetter"("letterNumber");
CREATE INDEX "OfficialLetter_letterType_status_createdAt_idx" ON "OfficialLetter"("letterType", "status", "createdAt");
CREATE INDEX "OfficialLetter_recipientUserId_createdAt_idx" ON "OfficialLetter"("recipientUserId", "createdAt");
CREATE INDEX "OfficialLetter_organizationUnitId_status_idx" ON "OfficialLetter"("organizationUnitId", "status");
CREATE INDEX "OfficialLetter_workspaceId_status_idx" ON "OfficialLetter"("workspaceId", "status");
