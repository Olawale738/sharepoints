-- CreateEnum
CREATE TYPE "ComplianceCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "ComplianceAudienceType" AS ENUM ('ALL_ACTIVE', 'DEPARTMENT', 'WORKSPACE', 'SELECTED');

-- CreateEnum
CREATE TYPE "ComplianceAssignmentStatus" AS ENUM ('PENDING', 'SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED', 'EXEMPT', 'SANCTIONED');

-- CreateEnum
CREATE TYPE "MemberSanctionType" AS ENUM ('WARNING', 'RESTRICT_CHAT', 'RESTRICT_FILES');

-- CreateEnum
CREATE TYPE "MemberSanctionStatus" AS ENUM ('ACTIVE', 'LIFTED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SecurityEventType" ADD VALUE 'MEMBER_SANCTION_ISSUED';
ALTER TYPE "SecurityEventType" ADD VALUE 'MEMBER_SANCTION_LIFTED';

-- CreateTable
CREATE TABLE "MemberComplianceCampaign" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "requiredFields" JSONB NOT NULL,
    "status" "ComplianceCampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "audienceType" "ComplianceAudienceType" NOT NULL,
    "audienceReferenceId" TEXT,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "requiresReview" BOOLEAN NOT NULL DEFAULT true,
    "allowCareException" BOOLEAN NOT NULL DEFAULT true,
    "reminderIntervalDays" INTEGER NOT NULL DEFAULT 3,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "launchedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberComplianceCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberComplianceAssignment" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ComplianceAssignmentStatus" NOT NULL DEFAULT 'PENDING',
    "answers" JSONB,
    "completionPercent" INTEGER NOT NULL DEFAULT 0,
    "submittedAt" TIMESTAMP(3),
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "exceptionRequestedAt" TIMESTAMP(3),
    "exceptionCategory" TEXT,
    "exceptionNote" TEXT,
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "lastReminderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberComplianceAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberSanction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "type" "MemberSanctionType" NOT NULL,
    "status" "MemberSanctionStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT NOT NULL,
    "issuedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "liftedAt" TIMESTAMP(3),
    "liftedById" TEXT,
    "liftReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberSanction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemberComplianceCampaign_status_dueAt_idx" ON "MemberComplianceCampaign"("status", "dueAt");

-- CreateIndex
CREATE INDEX "MemberComplianceCampaign_createdById_createdAt_idx" ON "MemberComplianceCampaign"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "MemberComplianceCampaign_audienceType_audienceReferenceId_idx" ON "MemberComplianceCampaign"("audienceType", "audienceReferenceId");

-- CreateIndex
CREATE INDEX "MemberComplianceAssignment_userId_status_createdAt_idx" ON "MemberComplianceAssignment"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "MemberComplianceAssignment_campaignId_status_idx" ON "MemberComplianceAssignment"("campaignId", "status");

-- CreateIndex
CREATE INDEX "MemberComplianceAssignment_lastReminderAt_idx" ON "MemberComplianceAssignment"("lastReminderAt");

-- CreateIndex
CREATE UNIQUE INDEX "MemberComplianceAssignment_campaignId_userId_key" ON "MemberComplianceAssignment"("campaignId", "userId");

-- CreateIndex
CREATE INDEX "MemberSanction_userId_status_type_idx" ON "MemberSanction"("userId", "status", "type");

-- CreateIndex
CREATE INDEX "MemberSanction_assignmentId_idx" ON "MemberSanction"("assignmentId");

-- CreateIndex
CREATE INDEX "MemberSanction_expiresAt_status_idx" ON "MemberSanction"("expiresAt", "status");

-- CreateIndex
CREATE INDEX "MemberSanction_issuedById_createdAt_idx" ON "MemberSanction"("issuedById", "createdAt");

-- AddForeignKey
ALTER TABLE "MemberComplianceCampaign" ADD CONSTRAINT "MemberComplianceCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberComplianceAssignment" ADD CONSTRAINT "MemberComplianceAssignment_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MemberComplianceCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberComplianceAssignment" ADD CONSTRAINT "MemberComplianceAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberComplianceAssignment" ADD CONSTRAINT "MemberComplianceAssignment_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberSanction" ADD CONSTRAINT "MemberSanction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberSanction" ADD CONSTRAINT "MemberSanction_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "MemberComplianceAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberSanction" ADD CONSTRAINT "MemberSanction_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberSanction" ADD CONSTRAINT "MemberSanction_liftedById_fkey" FOREIGN KEY ("liftedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
