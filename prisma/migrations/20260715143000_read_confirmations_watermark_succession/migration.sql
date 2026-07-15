-- CreateEnum
CREATE TYPE "ReadRequirementTargetType" AS ENUM ('FILE', 'POLICY', 'ANNOUNCEMENT', 'OFFICIAL_LETTER', 'MONTHLY_REPORT');

-- AlterTable
ALTER TABLE "PresidentDelegation"
ADD COLUMN "canEmergencySuccession" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "emergencyOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "emergencyActivatedAt" TIMESTAMP(3),
ADD COLUMN "emergencyActivatedById" TEXT,
ADD COLUMN "emergencyReason" TEXT;

-- CreateTable
CREATE TABLE "DocumentReadRequirement" (
    "id" TEXT NOT NULL,
    "targetType" "ReadRequirementTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "title" TEXT NOT NULL,
    "instructions" TEXT,
    "audienceLabel" TEXT NOT NULL DEFAULT 'Selected LETW members',
    "audienceUserIds" JSONB NOT NULL,
    "dueAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "requiredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentReadRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentReadReceipt" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "signatureName" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "confirmedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentReadReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DocumentReadRequirement_targetType_targetId_key" ON "DocumentReadRequirement"("targetType", "targetId");

-- CreateIndex
CREATE INDEX "DocumentReadRequirement_workspaceId_active_dueAt_idx" ON "DocumentReadRequirement"("workspaceId", "active", "dueAt");

-- CreateIndex
CREATE INDEX "DocumentReadRequirement_requiredById_createdAt_idx" ON "DocumentReadRequirement"("requiredById", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentReadRequirement_targetType_active_idx" ON "DocumentReadRequirement"("targetType", "active");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentReadReceipt_requirementId_userId_key" ON "DocumentReadReceipt"("requirementId", "userId");

-- CreateIndex
CREATE INDEX "DocumentReadReceipt_userId_confirmedAt_idx" ON "DocumentReadReceipt"("userId", "confirmedAt");

-- CreateIndex
CREATE INDEX "DocumentReadReceipt_requirementId_confirmedAt_idx" ON "DocumentReadReceipt"("requirementId", "confirmedAt");
