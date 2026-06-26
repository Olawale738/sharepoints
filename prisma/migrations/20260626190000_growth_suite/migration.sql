CREATE TYPE "TrainingProgramStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "TrainingEnrollmentStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED', 'REVOKED');
CREATE TYPE "PrayerRequestVisibility" AS ENUM ('PRIVATE', 'PASTORAL', 'WORKSPACE');
CREATE TYPE "PrayerRequestStatus" AS ENUM ('OPEN', 'ASSIGNED', 'PRAYED_FOR', 'FOLLOW_UP', 'CLOSED');
CREATE TYPE "GrowthPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "MaintenanceTicketStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED');
CREATE TYPE "MinistryCampaignStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "SermonResourceVisibility" AS ENUM ('PRIVATE', 'LEADERSHIP', 'MEMBERS', 'PUBLIC');

CREATE TABLE "TrainingProgram" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "organizationUnitId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT NOT NULL,
  "level" TEXT NOT NULL DEFAULT 'Foundation',
  "requiredRole" TEXT,
  "durationMinutes" INTEGER,
  "status" "TrainingProgramStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingProgram_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TrainingProgram_workspaceId_status_idx" ON "TrainingProgram"("workspaceId", "status");
CREATE INDEX "TrainingProgram_organizationUnitId_status_idx" ON "TrainingProgram"("organizationUnitId", "status");
CREATE INDEX "TrainingProgram_category_status_idx" ON "TrainingProgram"("category", "status");

CREATE TABLE "TrainingEnrollment" (
  "id" TEXT NOT NULL,
  "programId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "TrainingEnrollmentStatus" NOT NULL DEFAULT 'ASSIGNED',
  "progress" INTEGER NOT NULL DEFAULT 0,
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "certificateNumber" TEXT,
  "certifiedAt" TIMESTAMP(3),
  "assignedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TrainingEnrollment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TrainingEnrollment_certificateNumber_key" ON "TrainingEnrollment"("certificateNumber");
CREATE UNIQUE INDEX "TrainingEnrollment_programId_userId_key" ON "TrainingEnrollment"("programId", "userId");
CREATE INDEX "TrainingEnrollment_userId_status_dueAt_idx" ON "TrainingEnrollment"("userId", "status", "dueAt");
CREATE INDEX "TrainingEnrollment_programId_status_idx" ON "TrainingEnrollment"("programId", "status");
CREATE INDEX "TrainingEnrollment_certificateNumber_idx" ON "TrainingEnrollment"("certificateNumber");

CREATE TABLE "PrayerRequest" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "organizationUnitId" TEXT,
  "title" TEXT NOT NULL,
  "details" TEXT NOT NULL,
  "visibility" "PrayerRequestVisibility" NOT NULL DEFAULT 'PASTORAL',
  "priority" "GrowthPriority" NOT NULL DEFAULT 'NORMAL',
  "status" "PrayerRequestStatus" NOT NULL DEFAULT 'OPEN',
  "createdById" TEXT NOT NULL,
  "assignedToId" TEXT,
  "prayedAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrayerRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PrayerRequest_createdById_status_createdAt_idx" ON "PrayerRequest"("createdById", "status", "createdAt");
CREATE INDEX "PrayerRequest_assignedToId_status_createdAt_idx" ON "PrayerRequest"("assignedToId", "status", "createdAt");
CREATE INDEX "PrayerRequest_workspaceId_visibility_status_idx" ON "PrayerRequest"("workspaceId", "visibility", "status");
CREATE INDEX "PrayerRequest_organizationUnitId_status_idx" ON "PrayerRequest"("organizationUnitId", "status");

CREATE TABLE "PrayerRequestNote" (
  "id" TEXT NOT NULL,
  "prayerRequestId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrayerRequestNote_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PrayerRequestNote_prayerRequestId_createdAt_idx" ON "PrayerRequestNote"("prayerRequestId", "createdAt");
CREATE INDEX "PrayerRequestNote_authorId_createdAt_idx" ON "PrayerRequestNote"("authorId", "createdAt");

CREATE TABLE "AssetMaintenanceTicket" (
  "id" TEXT NOT NULL,
  "resourceId" TEXT,
  "workspaceId" TEXT,
  "organizationUnitId" TEXT,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "issue" TEXT NOT NULL,
  "priority" "GrowthPriority" NOT NULL DEFAULT 'NORMAL',
  "status" "MaintenanceTicketStatus" NOT NULL DEFAULT 'OPEN',
  "assignedToId" TEXT,
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssetMaintenanceTicket_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AssetMaintenanceTicket_resourceId_status_idx" ON "AssetMaintenanceTicket"("resourceId", "status");
CREATE INDEX "AssetMaintenanceTicket_assignedToId_status_dueAt_idx" ON "AssetMaintenanceTicket"("assignedToId", "status", "dueAt");
CREATE INDEX "AssetMaintenanceTicket_workspaceId_status_idx" ON "AssetMaintenanceTicket"("workspaceId", "status");
CREATE INDEX "AssetMaintenanceTicket_organizationUnitId_status_idx" ON "AssetMaintenanceTicket"("organizationUnitId", "status");

CREATE TABLE "MinistryCampaign" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "organizationUnitId" TEXT,
  "ministryId" TEXT,
  "title" TEXT NOT NULL,
  "campaignType" TEXT NOT NULL,
  "objective" TEXT NOT NULL,
  "targetAudience" TEXT,
  "goalCount" INTEGER,
  "currentCount" INTEGER NOT NULL DEFAULT 0,
  "budgetAmount" INTEGER,
  "budgetCurrency" TEXT NOT NULL DEFAULT 'GBP',
  "status" "MinistryCampaignStatus" NOT NULL DEFAULT 'DRAFT',
  "ownerId" TEXT,
  "createdById" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3),
  "endsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MinistryCampaign_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MinistryCampaign_workspaceId_status_startsAt_idx" ON "MinistryCampaign"("workspaceId", "status", "startsAt");
CREATE INDEX "MinistryCampaign_organizationUnitId_status_startsAt_idx" ON "MinistryCampaign"("organizationUnitId", "status", "startsAt");
CREATE INDEX "MinistryCampaign_ministryId_status_idx" ON "MinistryCampaign"("ministryId", "status");
CREATE INDEX "MinistryCampaign_ownerId_status_idx" ON "MinistryCampaign"("ownerId", "status");

CREATE TABLE "CampaignUpdate" (
  "id" TEXT NOT NULL,
  "campaignId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "progressCount" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CampaignUpdate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CampaignUpdate_campaignId_createdAt_idx" ON "CampaignUpdate"("campaignId", "createdAt");
CREATE INDEX "CampaignUpdate_authorId_createdAt_idx" ON "CampaignUpdate"("authorId", "createdAt");

CREATE TABLE "SermonResource" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "organizationUnitId" TEXT,
  "title" TEXT NOT NULL,
  "speaker" TEXT NOT NULL,
  "scripture" TEXT,
  "language" TEXT NOT NULL DEFAULT 'en',
  "mediaUrl" TEXT,
  "notes" TEXT,
  "visibility" "SermonResourceVisibility" NOT NULL DEFAULT 'MEMBERS',
  "tags" JSONB,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SermonResource_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SermonResource_workspaceId_visibility_createdAt_idx" ON "SermonResource"("workspaceId", "visibility", "createdAt");
CREATE INDEX "SermonResource_organizationUnitId_visibility_createdAt_idx" ON "SermonResource"("organizationUnitId", "visibility", "createdAt");
CREATE INDEX "SermonResource_speaker_createdAt_idx" ON "SermonResource"("speaker", "createdAt");
CREATE INDEX "SermonResource_language_visibility_idx" ON "SermonResource"("language", "visibility");
