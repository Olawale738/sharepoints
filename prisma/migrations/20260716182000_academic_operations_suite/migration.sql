CREATE TABLE "AcademicBoardApproval" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "programName" TEXT,
  "educationLevel" TEXT,
  "fieldOfStudy" TEXT NOT NULL DEFAULT 'Theology',
  "boardDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "submittedById" TEXT NOT NULL,
  "submittedAt" TIMESTAMP(3),
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "notes" TEXT,
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcademicBoardApproval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AcademicBoardApprovalCandidate" (
  "id" TEXT NOT NULL,
  "boardId" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcademicBoardApprovalCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CertificatePrintLog" (
  "id" TEXT NOT NULL,
  "certificateId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'READY_FOR_PRINT',
  "method" TEXT,
  "trackingCode" TEXT,
  "handledById" TEXT,
  "handledAt" TIMESTAMP(3),
  "collectedBy" TEXT,
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CertificatePrintLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MinistryLicense" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "holderName" TEXT NOT NULL,
  "holderEmail" TEXT,
  "holderPhone" TEXT,
  "licenseType" TEXT NOT NULL,
  "licenseNumber" TEXT NOT NULL,
  "scope" TEXT,
  "ministryId" TEXT,
  "workspaceId" TEXT,
  "organizationUnitId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "renewedFromId" TEXT,
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  "renewalNote" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MinistryLicense_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AcademicAuditRun" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "summary" TEXT,
  "counts" JSONB,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AcademicAuditRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AcademicAuditFinding" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
  "findingType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "detail" TEXT NOT NULL,
  "candidateId" TEXT,
  "certificateId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolvedById" TEXT,
  CONSTRAINT "AcademicAuditFinding_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AcademicBoardApproval_status_boardDate_idx" ON "AcademicBoardApproval"("status", "boardDate");
CREATE INDEX "AcademicBoardApproval_programName_educationLevel_status_idx" ON "AcademicBoardApproval"("programName", "educationLevel", "status");
CREATE INDEX "AcademicBoardApproval_submittedById_createdAt_idx" ON "AcademicBoardApproval"("submittedById", "createdAt");
CREATE UNIQUE INDEX "AcademicBoardApprovalCandidate_boardId_candidateId_key" ON "AcademicBoardApprovalCandidate"("boardId", "candidateId");
CREATE INDEX "AcademicBoardApprovalCandidate_candidateId_status_idx" ON "AcademicBoardApprovalCandidate"("candidateId", "status");
CREATE INDEX "AcademicBoardApprovalCandidate_boardId_status_idx" ON "AcademicBoardApprovalCandidate"("boardId", "status");
CREATE INDEX "CertificatePrintLog_certificateId_status_createdAt_idx" ON "CertificatePrintLog"("certificateId", "status", "createdAt");
CREATE INDEX "CertificatePrintLog_status_handledAt_idx" ON "CertificatePrintLog"("status", "handledAt");
CREATE INDEX "CertificatePrintLog_createdById_createdAt_idx" ON "CertificatePrintLog"("createdById", "createdAt");
CREATE UNIQUE INDEX "MinistryLicense_licenseNumber_key" ON "MinistryLicense"("licenseNumber");
CREATE INDEX "MinistryLicense_userId_status_expiresAt_idx" ON "MinistryLicense"("userId", "status", "expiresAt");
CREATE INDEX "MinistryLicense_licenseType_status_expiresAt_idx" ON "MinistryLicense"("licenseType", "status", "expiresAt");
CREATE INDEX "MinistryLicense_workspaceId_status_idx" ON "MinistryLicense"("workspaceId", "status");
CREATE INDEX "MinistryLicense_ministryId_status_idx" ON "MinistryLicense"("ministryId", "status");
CREATE INDEX "MinistryLicense_organizationUnitId_status_idx" ON "MinistryLicense"("organizationUnitId", "status");
CREATE INDEX "AcademicAuditRun_createdById_createdAt_idx" ON "AcademicAuditRun"("createdById", "createdAt");
CREATE INDEX "AcademicAuditRun_status_createdAt_idx" ON "AcademicAuditRun"("status", "createdAt");
CREATE INDEX "AcademicAuditFinding_runId_severity_idx" ON "AcademicAuditFinding"("runId", "severity");
CREATE INDEX "AcademicAuditFinding_candidateId_status_idx" ON "AcademicAuditFinding"("candidateId", "status");
CREATE INDEX "AcademicAuditFinding_certificateId_status_idx" ON "AcademicAuditFinding"("certificateId", "status");
CREATE INDEX "AcademicAuditFinding_findingType_status_idx" ON "AcademicAuditFinding"("findingType", "status");
