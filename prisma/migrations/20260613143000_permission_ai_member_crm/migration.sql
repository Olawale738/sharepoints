-- AlterEnum
ALTER TYPE "SecurityEventType" ADD VALUE 'ACTIVITY_LOGS_CLEARED';

-- AlterTable
ALTER TABLE "WorkspaceRolePermission" ADD COLUMN     "canClearActivity" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "MemberProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "phone" TEXT,
    "alternatePhone" TEXT,
    "membershipNumber" TEXT,
    "membershipStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "dateOfBirth" TIMESTAMP(3),
    "gender" TEXT,
    "maritalStatus" TEXT,
    "address" TEXT,
    "city" TEXT,
    "country" TEXT,
    "occupation" TEXT,
    "employer" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "firstVisitAt" TIMESTAMP(3),
    "salvationAt" TIMESTAMP(3),
    "baptismAt" TIMESTAMP(3),
    "membershipStartedAt" TIMESTAMP(3),
    "communicationPreference" TEXT,
    "ministryInterests" JSONB,
    "skills" JSONB,
    "pastoralCareStatus" TEXT,
    "adminNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MemberProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAssistantThread" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiAssistantThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAssistantMessage" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "mode" TEXT,
    "sources" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAssistantMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiAssistantAudit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "threadId" TEXT,
    "mode" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "workspaceIds" JSONB NOT NULL,
    "sources" JSONB NOT NULL,
    "model" TEXT,
    "status" TEXT NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiAssistantAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberProfile_userId_key" ON "MemberProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberProfile_membershipNumber_key" ON "MemberProfile"("membershipNumber");

-- CreateIndex
CREATE INDEX "MemberProfile_membershipStatus_idx" ON "MemberProfile"("membershipStatus");

-- CreateIndex
CREATE INDEX "MemberProfile_city_idx" ON "MemberProfile"("city");

-- CreateIndex
CREATE INDEX "MemberProfile_pastoralCareStatus_idx" ON "MemberProfile"("pastoralCareStatus");

-- CreateIndex
CREATE INDEX "AiAssistantThread_userId_updatedAt_idx" ON "AiAssistantThread"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AiAssistantMessage_threadId_createdAt_idx" ON "AiAssistantMessage"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "AiAssistantAudit_userId_createdAt_idx" ON "AiAssistantAudit"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AiAssistantAudit_threadId_createdAt_idx" ON "AiAssistantAudit"("threadId", "createdAt");

-- CreateIndex
CREATE INDEX "AiAssistantAudit_status_createdAt_idx" ON "AiAssistantAudit"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "MemberProfile" ADD CONSTRAINT "MemberProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAssistantThread" ADD CONSTRAINT "AiAssistantThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAssistantMessage" ADD CONSTRAINT "AiAssistantMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AiAssistantThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAssistantAudit" ADD CONSTRAINT "AiAssistantAudit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiAssistantAudit" ADD CONSTRAINT "AiAssistantAudit_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "AiAssistantThread"("id") ON DELETE SET NULL ON UPDATE CASCADE;
