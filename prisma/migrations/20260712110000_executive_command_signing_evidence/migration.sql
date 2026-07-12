CREATE TYPE "WhatsAppCommandStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'SENT', 'CANCELLED', 'FAILED');

CREATE TYPE "EvidenceVaultType" AS ENUM ('DOCUMENT', 'SCREENSHOT', 'SIGNATURE', 'WITNESS_RECORD', 'INCIDENT_FILE', 'OTHER');

CREATE TYPE "EvidenceVaultStatus" AS ENUM ('OPEN', 'LEGAL_HOLD', 'ARCHIVED', 'RELEASED');

CREATE TYPE "DigitalSignatureStatus" AS ENUM ('REQUESTED', 'SIGNED', 'REVOKED');

ALTER TABLE "WorkspaceRolePermission"
ADD COLUMN "canUseWhatsAppCommandBot" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canManageDigitalSignatures" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canManageEvidenceVault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canViewExecutiveBriefing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canDeleteReports" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canClearReportLogs" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "WhatsAppAdminCommand" (
  "id" TEXT NOT NULL,
  "command" TEXT NOT NULL,
  "parsedIntent" TEXT NOT NULL,
  "targetScope" TEXT,
  "draftAction" JSONB NOT NULL,
  "status" "WhatsAppCommandStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
  "requestedById" TEXT NOT NULL,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "sentAt" TIMESTAMP(3),
  "resultSummary" TEXT,
  "sourceConversationId" TEXT,
  "sourceMessageId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WhatsAppAdminCommand_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WhatsAppAdminCommand_status_createdAt_idx" ON "WhatsAppAdminCommand"("status", "createdAt");
CREATE INDEX "WhatsAppAdminCommand_requestedById_createdAt_idx" ON "WhatsAppAdminCommand"("requestedById", "createdAt");
CREATE INDEX "WhatsAppAdminCommand_parsedIntent_status_idx" ON "WhatsAppAdminCommand"("parsedIntent", "status");

CREATE TABLE "DigitalSignature" (
  "id" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "signerId" TEXT,
  "signerName" TEXT NOT NULL,
  "signerEmail" TEXT,
  "requestedById" TEXT NOT NULL,
  "status" "DigitalSignatureStatus" NOT NULL DEFAULT 'REQUESTED',
  "signatureName" TEXT,
  "signedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "verificationHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DigitalSignature_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DigitalSignature_verificationHash_key" ON "DigitalSignature"("verificationHash");
CREATE INDEX "DigitalSignature_targetType_targetId_idx" ON "DigitalSignature"("targetType", "targetId");
CREATE INDEX "DigitalSignature_signerId_status_idx" ON "DigitalSignature"("signerId", "status");
CREATE INDEX "DigitalSignature_status_createdAt_idx" ON "DigitalSignature"("status", "createdAt");

CREATE TABLE "ConfidentialEvidenceItem" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "organizationUnitId" TEXT,
  "evidenceType" "EvidenceVaultType" NOT NULL,
  "title" TEXT NOT NULL,
  "subjectName" TEXT,
  "summary" TEXT NOT NULL,
  "sourceUrl" TEXT,
  "storageKey" TEXT,
  "restrictedTo" TEXT NOT NULL DEFAULT 'TOP_PASTORS_AND_ADMINS',
  "legalHold" BOOLEAN NOT NULL DEFAULT true,
  "status" "EvidenceVaultStatus" NOT NULL DEFAULT 'LEGAL_HOLD',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConfidentialEvidenceItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConfidentialEvidenceItem_workspaceId_status_idx" ON "ConfidentialEvidenceItem"("workspaceId", "status");
CREATE INDEX "ConfidentialEvidenceItem_organizationUnitId_status_idx" ON "ConfidentialEvidenceItem"("organizationUnitId", "status");
CREATE INDEX "ConfidentialEvidenceItem_evidenceType_status_createdAt_idx" ON "ConfidentialEvidenceItem"("evidenceType", "status", "createdAt");
CREATE INDEX "ConfidentialEvidenceItem_createdById_createdAt_idx" ON "ConfidentialEvidenceItem"("createdById", "createdAt");

CREATE TABLE "ConfidentialEvidenceAccessLog" (
  "id" TEXT NOT NULL,
  "evidenceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConfidentialEvidenceAccessLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ConfidentialEvidenceAccessLog_evidenceId_createdAt_idx" ON "ConfidentialEvidenceAccessLog"("evidenceId", "createdAt");
CREATE INDEX "ConfidentialEvidenceAccessLog_userId_createdAt_idx" ON "ConfidentialEvidenceAccessLog"("userId", "createdAt");
