ALTER TABLE "OfficialIssuanceGrant"
  ADD COLUMN IF NOT EXISTS "canIssueAcademicCertificates" BOOLEAN NOT NULL DEFAULT false;
