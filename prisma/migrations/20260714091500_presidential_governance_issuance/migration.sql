-- CreateEnum
CREATE TYPE "OfficialIssuanceScope" AS ENUM ('CERTIFICATE', 'ID_CARD', 'OFFICIAL_LETTER');

-- CreateEnum
CREATE TYPE "PresidentialGovernanceControlType" AS ENUM (
  'DOCUMENT_POLICY_ENGINE',
  'PRESIDENTIAL_APPROVAL_LOCK',
  'SENSITIVE_DOCUMENT_WATERMARKING',
  'SCREENSHOT_PRINT_RESTRICTION',
  'LEADERSHIP_ACCOUNTABILITY_SCORE',
  'BRANCH_RISK_ALERT',
  'SECURE_GUEST_REVIEW_ROOM',
  'CONFIDENTIAL_REDACTION',
  'MINISTER_CREDENTIAL_REGISTER',
  'INCIDENT_RESPONSE_CENTER',
  'OFFICIAL_CIRCULAR_SYSTEM',
  'MEMBER_PRIVACY_CONSENT'
);

-- CreateEnum
CREATE TYPE "PresidentialGovernanceControlStatus" AS ENUM ('ACTIVE', 'PENDING_REVIEW', 'RESOLVED', 'ARCHIVED', 'REVOKED');

-- CreateTable
CREATE TABLE "OfficialIssuanceGrant" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "grantedById" TEXT NOT NULL,
  "canIssueCertificates" BOOLEAN NOT NULL DEFAULT false,
  "canIssueIdCards" BOOLEAN NOT NULL DEFAULT false,
  "canIssueLetters" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "OfficialIssuanceGrant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PresidentialGovernanceRecord" (
  "id" TEXT NOT NULL,
  "controlType" "PresidentialGovernanceControlType" NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "status" "PresidentialGovernanceControlStatus" NOT NULL DEFAULT 'ACTIVE',
  "severity" TEXT NOT NULL DEFAULT 'NORMAL',
  "workspaceId" TEXT,
  "organizationUnitId" TEXT,
  "subjectUserId" TEXT,
  "ownerUserId" TEXT,
  "dueAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PresidentialGovernanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OfficialIssuanceGrant_userId_key" ON "OfficialIssuanceGrant"("userId");

-- CreateIndex
CREATE INDEX "OfficialIssuanceGrant_grantedById_createdAt_idx" ON "OfficialIssuanceGrant"("grantedById", "createdAt");

-- CreateIndex
CREATE INDEX "OfficialIssuanceGrant_revokedAt_expiresAt_idx" ON "OfficialIssuanceGrant"("revokedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "PresidentialGovernanceRecord_controlType_status_createdAt_idx" ON "PresidentialGovernanceRecord"("controlType", "status", "createdAt");

-- CreateIndex
CREATE INDEX "PresidentialGovernanceRecord_workspaceId_controlType_status_idx" ON "PresidentialGovernanceRecord"("workspaceId", "controlType", "status");

-- CreateIndex
CREATE INDEX "PresidentialGovernanceRecord_organizationUnitId_controlType_status_idx" ON "PresidentialGovernanceRecord"("organizationUnitId", "controlType", "status");

-- CreateIndex
CREATE INDEX "PresidentialGovernanceRecord_subjectUserId_controlType_status_idx" ON "PresidentialGovernanceRecord"("subjectUserId", "controlType", "status");

-- CreateIndex
CREATE INDEX "PresidentialGovernanceRecord_ownerUserId_status_dueAt_idx" ON "PresidentialGovernanceRecord"("ownerUserId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "PresidentialGovernanceRecord_createdById_createdAt_idx" ON "PresidentialGovernanceRecord"("createdById", "createdAt");

-- AddForeignKey
ALTER TABLE "OfficialIssuanceGrant" ADD CONSTRAINT "OfficialIssuanceGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfficialIssuanceGrant" ADD CONSTRAINT "OfficialIssuanceGrant_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
