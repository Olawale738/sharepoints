CREATE TYPE "WorkspaceAudienceMode" AS ENUM ('MEMBER_FACING', 'WORKER_TEAM', 'LEADERSHIP', 'EXECUTIVE_BOARD');

CREATE TYPE "GivingReceiptStatus" AS ENUM ('ACTIVE', 'REVOKED', 'VOID');

CREATE TYPE "ServicePlanStatus" AS ENUM ('DRAFT', 'READY', 'COMPLETED', 'ARCHIVED');

ALTER TABLE "Workspace"
  ADD COLUMN "audienceMode" "WorkspaceAudienceMode" NOT NULL DEFAULT 'WORKER_TEAM',
  ADD COLUMN "memberDirectoryOpen" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "MemberProfile"
  ADD COLUMN "weddingAnniversaryAt" TIMESTAMP(3);

CREATE INDEX "Workspace_audienceMode_idx" ON "Workspace"("audienceMode");

CREATE TABLE "ServicePlan" (
  "id" TEXT NOT NULL,
  "eventId" TEXT,
  "workspaceId" TEXT,
  "organizationUnitId" TEXT,
  "title" TEXT NOT NULL,
  "serviceType" "ChurchEventType" NOT NULL DEFAULT 'SERVICE',
  "status" "ServicePlanStatus" NOT NULL DEFAULT 'DRAFT',
  "theme" TEXT,
  "preacher" TEXT,
  "coordinatorId" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3),
  "orderOfService" JSONB,
  "ministers" JSONB,
  "choirSongs" JSONB,
  "mediaTeam" JSONB,
  "prayerPoints" TEXT,
  "attendanceTotal" INTEGER,
  "newVisitors" INTEGER,
  "salvationDecisions" INTEGER,
  "testimoniesCount" INTEGER,
  "offeringSummary" TEXT,
  "postServiceReport" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ServicePlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ServicePlan_workspaceId_status_startsAt_idx" ON "ServicePlan"("workspaceId", "status", "startsAt");
CREATE INDEX "ServicePlan_organizationUnitId_status_startsAt_idx" ON "ServicePlan"("organizationUnitId", "status", "startsAt");
CREATE INDEX "ServicePlan_eventId_idx" ON "ServicePlan"("eventId");
CREATE INDEX "ServicePlan_coordinatorId_status_idx" ON "ServicePlan"("coordinatorId", "status");

CREATE TABLE "GivingReceipt" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "donorName" TEXT NOT NULL,
  "donorEmail" TEXT,
  "donorPhone" TEXT,
  "amountCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'GBP',
  "fund" TEXT NOT NULL,
  "paymentMethod" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL,
  "receiptNumber" TEXT NOT NULL,
  "qrToken" TEXT NOT NULL,
  "status" "GivingReceiptStatus" NOT NULL DEFAULT 'ACTIVE',
  "notes" TEXT,
  "issuedById" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GivingReceipt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GivingReceipt_receiptNumber_key" ON "GivingReceipt"("receiptNumber");
CREATE UNIQUE INDEX "GivingReceipt_qrToken_key" ON "GivingReceipt"("qrToken");
CREATE INDEX "GivingReceipt_userId_receivedAt_idx" ON "GivingReceipt"("userId", "receivedAt");
CREATE INDEX "GivingReceipt_status_receivedAt_idx" ON "GivingReceipt"("status", "receivedAt");
CREATE INDEX "GivingReceipt_fund_receivedAt_idx" ON "GivingReceipt"("fund", "receivedAt");
CREATE INDEX "GivingReceipt_donorEmail_idx" ON "GivingReceipt"("donorEmail");

CREATE TABLE "LeadershipCommandDraft" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "commandText" TEXT NOT NULL,
  "intent" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "payload" JSONB,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LeadershipCommandDraft_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LeadershipCommandDraft_userId_createdAt_idx" ON "LeadershipCommandDraft"("userId", "createdAt");
CREATE INDEX "LeadershipCommandDraft_status_createdAt_idx" ON "LeadershipCommandDraft"("status", "createdAt");
