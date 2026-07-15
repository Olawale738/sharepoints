-- Educational and external-recipient certificate support.

ALTER TABLE "MemberCertificationBadge"
ALTER COLUMN "userId" DROP NOT NULL,
ADD COLUMN "certificateCategory" TEXT NOT NULL DEFAULT 'MINISTRY',
ADD COLUMN "recipientName" TEXT,
ADD COLUMN "recipientEmail" TEXT,
ADD COLUMN "recipientPhone" TEXT,
ADD COLUMN "recipientPhotoUrl" TEXT,
ADD COLUMN "recipientOrganization" TEXT,
ADD COLUMN "educationLevel" TEXT,
ADD COLUMN "programName" TEXT,
ADD COLUMN "fieldOfStudy" TEXT,
ADD COLUMN "gradeOrHonors" TEXT,
ADD COLUMN "studyMode" TEXT,
ADD COLUMN "studyStartDate" TIMESTAMP(3),
ADD COLUMN "studyEndDate" TIMESTAMP(3),
ADD COLUMN "completionDate" TIMESTAMP(3),
ADD COLUMN "customBody" TEXT,
ADD COLUMN "sealNumber" TEXT,
ADD COLUMN "credentialHash" TEXT,
ADD COLUMN "digitalSignature" TEXT;

CREATE UNIQUE INDEX "MemberCertificationBadge_sealNumber_key" ON "MemberCertificationBadge"("sealNumber");
CREATE INDEX "MemberCertificationBadge_certificateCategory_status_issuedAt_idx" ON "MemberCertificationBadge"("certificateCategory", "status", "issuedAt");
CREATE INDEX "MemberCertificationBadge_educationLevel_status_idx" ON "MemberCertificationBadge"("educationLevel", "status");
CREATE INDEX "MemberCertificationBadge_recipientEmail_status_idx" ON "MemberCertificationBadge"("recipientEmail", "status");
CREATE INDEX "MemberCertificationBadge_sealNumber_idx" ON "MemberCertificationBadge"("sealNumber");
