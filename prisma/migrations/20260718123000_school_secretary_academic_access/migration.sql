ALTER TABLE "OfficialIssuanceGrant"
ADD COLUMN IF NOT EXISTS "canManageSchoolAcademics" BOOLEAN NOT NULL DEFAULT false;

UPDATE "OfficialIssuanceGrant"
SET "canManageSchoolAcademics" = true
WHERE "canIssueAcademicCertificates" = true;
