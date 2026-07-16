ALTER TABLE "MemberCertificationBadge"
  ADD COLUMN "academicCandidateId" TEXT;

CREATE TABLE "AcademicCandidate" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "fullName" TEXT NOT NULL,
  "email" TEXT,
  "phone" TEXT,
  "photoUrl" TEXT,
  "organization" TEXT,
  "programName" TEXT NOT NULL,
  "educationLevel" TEXT NOT NULL,
  "fieldOfStudy" TEXT NOT NULL DEFAULT 'Theology',
  "studyMode" TEXT,
  "admissionDate" TIMESTAMP(3),
  "graduationDate" TIMESTAMP(3),
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "paymentStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "feesCleared" BOOLEAN NOT NULL DEFAULT false,
  "coursesCompleted" BOOLEAN NOT NULL DEFAULT false,
  "rectorApproved" BOOLEAN NOT NULL DEFAULT false,
  "photoUploaded" BOOLEAN NOT NULL DEFAULT false,
  "nameVerified" BOOLEAN NOT NULL DEFAULT false,
  "clearanceStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "clearanceNotes" TEXT,
  "createdById" TEXT NOT NULL,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcademicCandidate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AcademicCourseRecord" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "courseCode" TEXT,
  "courseTitle" TEXT NOT NULL,
  "credits" DOUBLE PRECISION,
  "grade" TEXT,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "completedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AcademicCourseRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CertificateSignatureProfile" (
  "id" TEXT NOT NULL,
  "ownerUserId" TEXT,
  "name" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'RECTOR',
  "imageUrl" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "approvedById" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CertificateSignatureProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CertificateBatchJob" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "certificateCategory" TEXT NOT NULL DEFAULT 'EDUCATION',
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "totalRows" INTEGER NOT NULL DEFAULT 0,
  "issuedCount" INTEGER NOT NULL DEFAULT 0,
  "failedCount" INTEGER NOT NULL DEFAULT 0,
  "createdById" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CertificateBatchJob_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MemberCertificationBadge_academicCandidateId_status_issuedAt_idx"
  ON "MemberCertificationBadge"("academicCandidateId", "status", "issuedAt");

CREATE INDEX "AcademicCandidate_email_idx" ON "AcademicCandidate"("email");
CREATE INDEX "AcademicCandidate_status_clearanceStatus_idx" ON "AcademicCandidate"("status", "clearanceStatus");
CREATE INDEX "AcademicCandidate_educationLevel_clearanceStatus_idx" ON "AcademicCandidate"("educationLevel", "clearanceStatus");
CREATE INDEX "AcademicCandidate_createdById_createdAt_idx" ON "AcademicCandidate"("createdById", "createdAt");

CREATE INDEX "AcademicCourseRecord_candidateId_status_idx" ON "AcademicCourseRecord"("candidateId", "status");
CREATE INDEX "AcademicCourseRecord_createdById_createdAt_idx" ON "AcademicCourseRecord"("createdById", "createdAt");

CREATE INDEX "CertificateSignatureProfile_role_active_idx" ON "CertificateSignatureProfile"("role", "active");
CREATE INDEX "CertificateSignatureProfile_ownerUserId_active_idx" ON "CertificateSignatureProfile"("ownerUserId", "active");
CREATE INDEX "CertificateSignatureProfile_createdById_createdAt_idx" ON "CertificateSignatureProfile"("createdById", "createdAt");

CREATE INDEX "CertificateBatchJob_certificateCategory_createdAt_idx" ON "CertificateBatchJob"("certificateCategory", "createdAt");
CREATE INDEX "CertificateBatchJob_createdById_createdAt_idx" ON "CertificateBatchJob"("createdById", "createdAt");
