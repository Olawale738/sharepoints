CREATE TABLE "CertificateCorrectionRequest" (
  "id" TEXT NOT NULL,
  "certificateId" TEXT NOT NULL,
  "academicCandidateId" TEXT,
  "requesterId" TEXT,
  "requesterName" TEXT,
  "requesterEmail" TEXT,
  "correctionType" TEXT NOT NULL,
  "requestedChanges" JSONB NOT NULL,
  "reason" TEXT,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT,
  "replacementCertificateId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CertificateCorrectionRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CertificateCorrectionRequest_certificateId_status_createdAt_idx" ON "CertificateCorrectionRequest"("certificateId", "status", "createdAt");
CREATE INDEX "CertificateCorrectionRequest_academicCandidateId_status_idx" ON "CertificateCorrectionRequest"("academicCandidateId", "status");
CREATE INDEX "CertificateCorrectionRequest_requesterId_status_createdAt_idx" ON "CertificateCorrectionRequest"("requesterId", "status", "createdAt");
CREATE INDEX "CertificateCorrectionRequest_requesterEmail_status_createdAt_idx" ON "CertificateCorrectionRequest"("requesterEmail", "status", "createdAt");
CREATE INDEX "CertificateCorrectionRequest_status_createdAt_idx" ON "CertificateCorrectionRequest"("status", "createdAt");
