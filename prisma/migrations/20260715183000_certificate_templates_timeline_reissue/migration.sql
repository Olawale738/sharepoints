-- Certificate template designer, signatories, marriage certificates, and timeline events.

ALTER TABLE "MemberCertificationBadge"
ADD COLUMN "templateStyle" TEXT NOT NULL DEFAULT 'CLASSIC',
ADD COLUMN "templateAccent" TEXT NOT NULL DEFAULT 'NAVY_GOLD',
ADD COLUMN "sealStyle" TEXT NOT NULL DEFAULT 'CHIP',
ADD COLUMN "signatureLayout" TEXT NOT NULL DEFAULT 'DUAL',
ADD COLUMN "watermarkStrength" TEXT NOT NULL DEFAULT 'STANDARD',
ADD COLUMN "secondSignatoryName" TEXT,
ADD COLUMN "secondSignatoryTitle" TEXT,
ADD COLUMN "secondSignatorySignatureUrl" TEXT,
ADD COLUMN "spouseOneName" TEXT,
ADD COLUMN "spouseOneEmail" TEXT,
ADD COLUMN "spouseOnePhotoUrl" TEXT,
ADD COLUMN "spouseTwoName" TEXT,
ADD COLUMN "spouseTwoEmail" TEXT,
ADD COLUMN "spouseTwoPhotoUrl" TEXT,
ADD COLUMN "marriageDate" TIMESTAMP(3),
ADD COLUMN "marriageLocation" TEXT,
ADD COLUMN "officiantName" TEXT,
ADD COLUMN "witnessOneName" TEXT,
ADD COLUMN "witnessTwoName" TEXT,
ADD COLUMN "replacementOfId" TEXT,
ADD COLUMN "replacedById" TEXT,
ADD COLUMN "reissueReason" TEXT;

CREATE INDEX "MemberCertificationBadge_replacementOfId_idx" ON "MemberCertificationBadge"("replacementOfId");
CREATE INDEX "MemberCertificationBadge_replacedById_idx" ON "MemberCertificationBadge"("replacedById");

CREATE TABLE "CertificateEvent" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "actorId" TEXT,
    "eventType" TEXT NOT NULL,
    "summary" TEXT,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertificateEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CertificateEvent_certificateId_createdAt_idx" ON "CertificateEvent"("certificateId", "createdAt");
CREATE INDEX "CertificateEvent_eventType_createdAt_idx" ON "CertificateEvent"("eventType", "createdAt");
CREATE INDEX "CertificateEvent_actorId_createdAt_idx" ON "CertificateEvent"("actorId", "createdAt");
