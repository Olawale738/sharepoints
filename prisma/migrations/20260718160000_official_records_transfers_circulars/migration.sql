CREATE TYPE "PastorTransferStatus" AS ENUM ('DRAFT', 'PENDING_HANDOVER', 'APPROVED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

CREATE TYPE "OfficialCircularStatus" AS ENUM ('DRAFT', 'ISSUED', 'EXPIRED', 'REPLACED', 'REVOKED', 'ARCHIVED');

CREATE TYPE "OfficialCircularAcknowledgementStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'DECLINED', 'EXEMPTED');

CREATE TABLE "PastorTransferPosting" (
    "id" TEXT NOT NULL,
    "transferNumber" TEXT NOT NULL,
    "sealNumber" TEXT NOT NULL,
    "verifyToken" TEXT NOT NULL,
    "pastorUserId" TEXT NOT NULL,
    "fromOrganizationUnitId" TEXT,
    "toOrganizationUnitId" TEXT,
    "fromWorkspaceId" TEXT,
    "toWorkspaceId" TEXT,
    "title" TEXT NOT NULL,
    "reason" TEXT,
    "effectiveAt" TIMESTAMP(3) NOT NULL,
    "handoverDueAt" TIMESTAMP(3),
    "handoverChecklist" JSONB,
    "housingNeeds" TEXT,
    "resourceNeeds" TEXT,
    "branchAssignmentHistory" JSONB,
    "status" "PastorTransferStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "replacementOfId" TEXT,
    "replacedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PastorTransferPosting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfficialCircular" (
    "id" TEXT NOT NULL,
    "circularNumber" TEXT NOT NULL,
    "sealNumber" TEXT NOT NULL,
    "verifyToken" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'LEADERSHIP',
    "audienceType" TEXT NOT NULL DEFAULT 'SELECTED_UNITS',
    "audienceLabel" TEXT NOT NULL DEFAULT 'Selected LETW leaders and branches',
    "audience" JSONB,
    "workspaceId" TEXT,
    "organizationUnitId" TEXT,
    "requiresAcknowledgement" BOOLEAN NOT NULL DEFAULT true,
    "status" "OfficialCircularStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedById" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "replacementOfId" TEXT,
    "replacedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficialCircular_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OfficialCircularAcknowledgement" (
    "id" TEXT NOT NULL,
    "circularId" TEXT NOT NULL,
    "organizationUnitId" TEXT,
    "workspaceId" TEXT,
    "userId" TEXT,
    "acknowledgedById" TEXT,
    "status" "OfficialCircularAcknowledgementStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficialCircularAcknowledgement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PastorTransferPosting_transferNumber_key" ON "PastorTransferPosting"("transferNumber");
CREATE UNIQUE INDEX "PastorTransferPosting_sealNumber_key" ON "PastorTransferPosting"("sealNumber");
CREATE UNIQUE INDEX "PastorTransferPosting_verifyToken_key" ON "PastorTransferPosting"("verifyToken");
CREATE INDEX "PastorTransferPosting_pastorUserId_status_effectiveAt_idx" ON "PastorTransferPosting"("pastorUserId", "status", "effectiveAt");
CREATE INDEX "PastorTransferPosting_fromOrganizationUnitId_status_idx" ON "PastorTransferPosting"("fromOrganizationUnitId", "status");
CREATE INDEX "PastorTransferPosting_toOrganizationUnitId_status_idx" ON "PastorTransferPosting"("toOrganizationUnitId", "status");
CREATE INDEX "PastorTransferPosting_fromWorkspaceId_status_idx" ON "PastorTransferPosting"("fromWorkspaceId", "status");
CREATE INDEX "PastorTransferPosting_toWorkspaceId_status_idx" ON "PastorTransferPosting"("toWorkspaceId", "status");
CREATE INDEX "PastorTransferPosting_status_effectiveAt_idx" ON "PastorTransferPosting"("status", "effectiveAt");
CREATE INDEX "PastorTransferPosting_sealNumber_idx" ON "PastorTransferPosting"("sealNumber");

CREATE UNIQUE INDEX "OfficialCircular_circularNumber_key" ON "OfficialCircular"("circularNumber");
CREATE UNIQUE INDEX "OfficialCircular_sealNumber_key" ON "OfficialCircular"("sealNumber");
CREATE UNIQUE INDEX "OfficialCircular_verifyToken_key" ON "OfficialCircular"("verifyToken");
CREATE INDEX "OfficialCircular_status_issuedAt_idx" ON "OfficialCircular"("status", "issuedAt");
CREATE INDEX "OfficialCircular_category_status_idx" ON "OfficialCircular"("category", "status");
CREATE INDEX "OfficialCircular_workspaceId_status_idx" ON "OfficialCircular"("workspaceId", "status");
CREATE INDEX "OfficialCircular_organizationUnitId_status_idx" ON "OfficialCircular"("organizationUnitId", "status");
CREATE INDEX "OfficialCircular_expiresAt_status_idx" ON "OfficialCircular"("expiresAt", "status");
CREATE INDEX "OfficialCircular_sealNumber_idx" ON "OfficialCircular"("sealNumber");

CREATE INDEX "OfficialCircularAcknowledgement_circularId_status_idx" ON "OfficialCircularAcknowledgement"("circularId", "status");
CREATE INDEX "OfficialCircularAcknowledgement_organizationUnitId_status_idx" ON "OfficialCircularAcknowledgement"("organizationUnitId", "status");
CREATE INDEX "OfficialCircularAcknowledgement_workspaceId_status_idx" ON "OfficialCircularAcknowledgement"("workspaceId", "status");
CREATE INDEX "OfficialCircularAcknowledgement_userId_status_idx" ON "OfficialCircularAcknowledgement"("userId", "status");
