ALTER TABLE "MemberCertificationBadge"
ADD COLUMN "certificatePreset" TEXT NOT NULL DEFAULT 'MEMBERSHIP_COVENANT',
ADD COLUMN "presidentSignatureUrl" TEXT;

CREATE INDEX "MemberCertificationBadge_certificatePreset_status_issuedAt_idx"
ON "MemberCertificationBadge"("certificatePreset", "status", "issuedAt");

