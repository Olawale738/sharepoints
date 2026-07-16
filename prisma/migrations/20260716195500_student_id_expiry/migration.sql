ALTER TABLE "AcademicCandidate"
ADD COLUMN "studentIdNumber" TEXT,
ADD COLUMN "studentIdIssuedAt" TIMESTAMP(3),
ADD COLUMN "studentIdExpiresAt" TIMESTAMP(3),
ADD COLUMN "studentIdStatus" TEXT NOT NULL DEFAULT 'ACTIVE';

CREATE UNIQUE INDEX "AcademicCandidate_studentIdNumber_key" ON "AcademicCandidate"("studentIdNumber");
CREATE INDEX "AcademicCandidate_studentIdStatus_studentIdExpiresAt_idx" ON "AcademicCandidate"("studentIdStatus", "studentIdExpiresAt");
