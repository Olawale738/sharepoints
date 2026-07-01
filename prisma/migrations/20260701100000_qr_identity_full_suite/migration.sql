ALTER TYPE "MembershipCardStatus" ADD VALUE IF NOT EXISTS 'LOST';

ALTER TABLE "DigitalMembershipCard"
  ADD COLUMN IF NOT EXISTS "lostAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lostById" TEXT,
  ADD COLUMN IF NOT EXISTS "renewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "renewedById" TEXT,
  ADD COLUMN IF NOT EXISTS "qrRotatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "qrRotationCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "offlinePayload" JSONB,
  ADD COLUMN IF NOT EXISTS "offlinePayloadHash" TEXT,
  ADD COLUMN IF NOT EXISTS "lastStatusReason" TEXT;

CREATE INDEX IF NOT EXISTS "DigitalMembershipCard_qrRotatedAt_idx"
  ON "DigitalMembershipCard"("qrRotatedAt");

CREATE TABLE IF NOT EXISTS "TemporaryVisitorPass" (
  "id" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "purpose" TEXT NOT NULL,
  "qrToken" TEXT NOT NULL,
  "accessPointId" TEXT,
  "organizationUnitId" TEXT,
  "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "issuedById" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  "scanCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TemporaryVisitorPass_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "TemporaryVisitorPass_qrToken_key"
  ON "TemporaryVisitorPass"("qrToken");
CREATE INDEX IF NOT EXISTS "TemporaryVisitorPass_accessPointId_status_validUntil_idx"
  ON "TemporaryVisitorPass"("accessPointId", "status", "validUntil");
CREATE INDEX IF NOT EXISTS "TemporaryVisitorPass_organizationUnitId_status_validUntil_idx"
  ON "TemporaryVisitorPass"("organizationUnitId", "status", "validUntil");
CREATE INDEX IF NOT EXISTS "TemporaryVisitorPass_status_validUntil_idx"
  ON "TemporaryVisitorPass"("status", "validUntil");

CREATE TABLE IF NOT EXISTS "MembershipHouseholdLink" (
  "id" TEXT NOT NULL,
  "primaryUserId" TEXT NOT NULL,
  "relatedUserId" TEXT,
  "displayName" TEXT NOT NULL,
  "relationship" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MembershipHouseholdLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "MembershipHouseholdLink_primaryUserId_createdAt_idx"
  ON "MembershipHouseholdLink"("primaryUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "MembershipHouseholdLink_relatedUserId_idx"
  ON "MembershipHouseholdLink"("relatedUserId");

CREATE TABLE IF NOT EXISTS "MemberOnboardingItem" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "completedById" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MemberOnboardingItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MemberOnboardingItem_userId_title_key"
  ON "MemberOnboardingItem"("userId", "title");
CREATE INDEX IF NOT EXISTS "MemberOnboardingItem_userId_status_dueAt_idx"
  ON "MemberOnboardingItem"("userId", "status", "dueAt");

CREATE TABLE IF NOT EXISTS "MemberCertificationBadge" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "issuer" TEXT NOT NULL DEFAULT 'Light Encounter Tabernacle Worldwide',
  "certificateNumber" TEXT,
  "verifyToken" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MemberCertificationBadge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MemberCertificationBadge_certificateNumber_key"
  ON "MemberCertificationBadge"("certificateNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "MemberCertificationBadge_verifyToken_key"
  ON "MemberCertificationBadge"("verifyToken");
CREATE INDEX IF NOT EXISTS "MemberCertificationBadge_userId_status_issuedAt_idx"
  ON "MemberCertificationBadge"("userId", "status", "issuedAt");
CREATE INDEX IF NOT EXISTS "MemberCertificationBadge_status_expiresAt_idx"
  ON "MemberCertificationBadge"("status", "expiresAt");

CREATE TABLE IF NOT EXISTS "DigitalIdAccessApproval" (
  "id" TEXT NOT NULL,
  "accessPointId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "reason" TEXT,
  "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "validUntil" TIMESTAMP(3),
  "approvedById" TEXT NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DigitalIdAccessApproval_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DigitalIdAccessApproval_accessPointId_userId_key"
  ON "DigitalIdAccessApproval"("accessPointId", "userId");
CREATE INDEX IF NOT EXISTS "DigitalIdAccessApproval_accessPointId_revokedAt_validUntil_idx"
  ON "DigitalIdAccessApproval"("accessPointId", "revokedAt", "validUntil");
CREATE INDEX IF NOT EXISTS "DigitalIdAccessApproval_userId_revokedAt_validUntil_idx"
  ON "DigitalIdAccessApproval"("userId", "revokedAt", "validUntil");

CREATE TABLE IF NOT EXISTS "QrBulkActionLog" (
  "id" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QrBulkActionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "QrBulkActionLog_action_createdAt_idx"
  ON "QrBulkActionLog"("action", "createdAt");
CREATE INDEX IF NOT EXISTS "QrBulkActionLog_createdById_createdAt_idx"
  ON "QrBulkActionLog"("createdById", "createdAt");

ALTER TABLE "AccessPoint"
  ADD COLUMN IF NOT EXISTS "highSecurity" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "requireExplicitApproval" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "requirePhotoMatch" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "AccessScanLog"
  ADD COLUMN IF NOT EXISTS "visitorPassId" TEXT,
  ADD COLUMN IF NOT EXISTS "purpose" TEXT NOT NULL DEFAULT 'ACCESS',
  ADD COLUMN IF NOT EXISTS "riskScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "suspicious" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "photoMatchRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB;

CREATE INDEX IF NOT EXISTS "AccessScanLog_visitorPassId_createdAt_idx"
  ON "AccessScanLog"("visitorPassId", "createdAt");
CREATE INDEX IF NOT EXISTS "AccessScanLog_purpose_createdAt_idx"
  ON "AccessScanLog"("purpose", "createdAt");
CREATE INDEX IF NOT EXISTS "AccessScanLog_suspicious_createdAt_idx"
  ON "AccessScanLog"("suspicious", "createdAt");
