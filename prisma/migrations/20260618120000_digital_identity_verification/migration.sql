ALTER TABLE "DigitalMembershipCard"
ADD COLUMN "organizationId" TEXT;

UPDATE "DigitalMembershipCard"
SET "organizationId" = 'LETW.ORG-' || UPPER(SUBSTRING(MD5("id") FROM 1 FOR 10));

ALTER TABLE "DigitalMembershipCard"
ALTER COLUMN "organizationId" SET NOT NULL;

CREATE UNIQUE INDEX "DigitalMembershipCard_organizationId_key"
ON "DigitalMembershipCard"("organizationId");

CREATE TABLE "DigitalIdentityVerification" (
  "id" TEXT NOT NULL,
  "cardId" TEXT,
  "organizationId" TEXT,
  "outcome" TEXT NOT NULL,
  "scannedById" TEXT,
  "ipHash" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DigitalIdentityVerification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DigitalIdentityVerification_cardId_createdAt_idx"
ON "DigitalIdentityVerification"("cardId", "createdAt");

CREATE INDEX "DigitalIdentityVerification_organizationId_createdAt_idx"
ON "DigitalIdentityVerification"("organizationId", "createdAt");

CREATE INDEX "DigitalIdentityVerification_outcome_createdAt_idx"
ON "DigitalIdentityVerification"("outcome", "createdAt");

ALTER TYPE "SecurityEventType" ADD VALUE 'COMPLIANCE_RESPONSE_DELETED';
ALTER TYPE "SecurityEventType" ADD VALUE 'WORKSPACE_FORM_RESPONSE_DELETED';
