-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "NotificationDigest" AS ENUM ('IMMEDIATE', 'DAILY', 'WEEKLY', 'NEVER');

-- CreateEnum
CREATE TYPE "WorkflowTrigger" AS ENUM ('FILE_UPLOADED', 'FILE_APPROVED', 'TASK_CREATED', 'MEETING_ENDED', 'FORM_SUBMITTED', 'SCHEDULED');

-- CreateEnum
CREATE TYPE "WorkflowRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "RecycleItemType" AS ENUM ('FILE', 'FOLDER', 'WORKSPACE', 'CHANNEL_MESSAGE', 'DIRECT_MESSAGE', 'ORG_MESSAGE');

-- CreateEnum
CREATE TYPE "DlpAction" AS ENUM ('WARN', 'RESTRICT', 'BLOCK');

-- CreateEnum
CREATE TYPE "DlpIncidentStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "TranscriptStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ChurchEventType" AS ENUM ('SERVICE', 'EVENT', 'OUTREACH', 'MEETING', 'TRAINING');

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'COMPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "VolunteerStatus" AS ENUM ('INVITED', 'CONFIRMED', 'DECLINED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ResourceBookingStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "File" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT,
ADD COLUMN     "dlpClassification" TEXT,
ADD COLUMN     "dlpRestricted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "restoreUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Folder" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT,
ADD COLUMN     "restoreUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "deliverAt" TIMESTAMP(3),
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "emailSentAt" TIMESTAMP(3),
ADD COLUMN     "priority" "NotificationPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "pushSentAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "NotificationPreference" ADD COLUMN     "digest" "NotificationDigest" NOT NULL DEFAULT 'IMMEDIATE',
ADD COLUMN     "pushEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "quietHoursEnd" TEXT,
ADD COLUMN     "quietHoursStart" TEXT,
ADD COLUMN     "timeZone" TEXT NOT NULL DEFAULT 'Europe/London';

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT,
ADD COLUMN     "restoreUntil" TIMESTAMP(3),
ADD COLUMN     "templateId" TEXT;

-- AlterTable
ALTER TABLE "WorkspaceMeeting" ADD COLUMN     "transcript" TEXT,
ADD COLUMN     "transcriptLanguage" TEXT,
ADD COLUMN     "transcriptStatus" "TranscriptStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "transcriptSummary" TEXT;

-- CreateTable
CREATE TABLE "WorkflowDefinition" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger" "WorkflowTrigger" NOT NULL,
    "conditions" JSONB,
    "actions" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "trigger" "WorkflowTrigger" NOT NULL,
    "triggerId" TEXT,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'RUNNING',
    "input" JSONB,
    "output" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecycleBinItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "itemType" "RecycleItemType" NOT NULL,
    "itemId" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "snapshot" JSONB,
    "deletedById" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "restoreUntil" TIMESTAMP(3) NOT NULL,
    "restoredAt" TIMESTAMP(3),
    "restoredById" TEXT,
    "purgedAt" TIMESTAMP(3),

    CONSTRAINT "RecycleBinItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BackupSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "createdById" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "BackupStatus" NOT NULL DEFAULT 'PENDING',
    "storageKey" TEXT,
    "size" INTEGER,
    "checksum" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BackupSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DlpRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pattern" TEXT NOT NULL,
    "action" "DlpAction" NOT NULL DEFAULT 'RESTRICT',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "workspaceId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DlpRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DlpIncident" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fileId" TEXT,
    "ruleId" TEXT,
    "detectedById" TEXT,
    "classification" TEXT NOT NULL,
    "action" "DlpAction" NOT NULL,
    "status" "DlpIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,

    CONSTRAINT "DlpIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "deviceName" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingAttendance" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "leftAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingActionItem" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "assigneeId" TEXT,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingActionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "definition" JSONB NOT NULL,
    "system" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminRolePreview" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "previewRole" "WorkspaceRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "AdminRolePreview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ministry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "leaderId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ministry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurchEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "ministryId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "eventType" "ChurchEventType" NOT NULL,
    "location" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "capacity" INTEGER,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChurchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurchAttendance" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "ChurchAttendance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolunteerAssignment" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ministryId" TEXT,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "status" "VolunteerStatus" NOT NULL DEFAULT 'INVITED',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VolunteerAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PastoralFollowUp" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "personName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "reason" TEXT NOT NULL,
    "notes" TEXT,
    "assignedToId" TEXT,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'NEW',
    "nextContactAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PastoralFollowUp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChurchResource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChurchResource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResourceBooking" (
    "id" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "eventId" TEXT,
    "title" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "ResourceBookingStatus" NOT NULL DEFAULT 'PENDING',
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResourceBooking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkflowDefinition_workspaceId_enabled_trigger_idx" ON "WorkflowDefinition"("workspaceId", "enabled", "trigger");

-- CreateIndex
CREATE INDEX "WorkflowDefinition_createdById_createdAt_idx" ON "WorkflowDefinition"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowRun_workflowId_startedAt_idx" ON "WorkflowRun"("workflowId", "startedAt");

-- CreateIndex
CREATE INDEX "WorkflowRun_workspaceId_status_startedAt_idx" ON "WorkflowRun"("workspaceId", "status", "startedAt");

-- CreateIndex
CREATE INDEX "RecycleBinItem_workspaceId_deletedAt_idx" ON "RecycleBinItem"("workspaceId", "deletedAt");

-- CreateIndex
CREATE INDEX "RecycleBinItem_restoreUntil_purgedAt_idx" ON "RecycleBinItem"("restoreUntil", "purgedAt");

-- CreateIndex
CREATE UNIQUE INDEX "RecycleBinItem_itemType_itemId_deletedAt_key" ON "RecycleBinItem"("itemType", "itemId", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BackupSnapshot_storageKey_key" ON "BackupSnapshot"("storageKey");

-- CreateIndex
CREATE INDEX "BackupSnapshot_workspaceId_createdAt_idx" ON "BackupSnapshot"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "BackupSnapshot_status_createdAt_idx" ON "BackupSnapshot"("status", "createdAt");

-- CreateIndex
CREATE INDEX "DlpRule_workspaceId_enabled_idx" ON "DlpRule"("workspaceId", "enabled");

-- CreateIndex
CREATE INDEX "DlpIncident_workspaceId_status_createdAt_idx" ON "DlpIncident"("workspaceId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DlpIncident_fileId_createdAt_idx" ON "DlpIncident"("fileId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_enabled_idx" ON "PushSubscription"("userId", "enabled");

-- CreateIndex
CREATE INDEX "MeetingAttendance_meetingId_joinedAt_idx" ON "MeetingAttendance"("meetingId", "joinedAt");

-- CreateIndex
CREATE INDEX "MeetingAttendance_userId_joinedAt_idx" ON "MeetingAttendance"("userId", "joinedAt");

-- CreateIndex
CREATE INDEX "MeetingActionItem_meetingId_completedAt_idx" ON "MeetingActionItem"("meetingId", "completedAt");

-- CreateIndex
CREATE INDEX "MeetingActionItem_assigneeId_dueAt_idx" ON "MeetingActionItem"("assigneeId", "dueAt");

-- CreateIndex
CREATE INDEX "WorkspaceTemplate_enabled_category_idx" ON "WorkspaceTemplate"("enabled", "category");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceTemplate_name_category_key" ON "WorkspaceTemplate"("name", "category");

-- CreateIndex
CREATE INDEX "AdminRolePreview_adminId_createdAt_idx" ON "AdminRolePreview"("adminId", "createdAt");

-- CreateIndex
CREATE INDEX "AdminRolePreview_workspaceId_previewRole_idx" ON "AdminRolePreview"("workspaceId", "previewRole");

-- CreateIndex
CREATE INDEX "Ministry_leaderId_active_idx" ON "Ministry"("leaderId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Ministry_workspaceId_name_key" ON "Ministry"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "ChurchEvent_workspaceId_startsAt_idx" ON "ChurchEvent"("workspaceId", "startsAt");

-- CreateIndex
CREATE INDEX "ChurchEvent_ministryId_startsAt_idx" ON "ChurchEvent"("ministryId", "startsAt");

-- CreateIndex
CREATE INDEX "ChurchAttendance_eventId_checkedInAt_idx" ON "ChurchAttendance"("eventId", "checkedInAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChurchAttendance_eventId_userId_key" ON "ChurchAttendance"("eventId", "userId");

-- CreateIndex
CREATE INDEX "VolunteerAssignment_userId_status_idx" ON "VolunteerAssignment"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerAssignment_eventId_userId_role_key" ON "VolunteerAssignment"("eventId", "userId", "role");

-- CreateIndex
CREATE INDEX "PastoralFollowUp_assignedToId_status_nextContactAt_idx" ON "PastoralFollowUp"("assignedToId", "status", "nextContactAt");

-- CreateIndex
CREATE INDEX "PastoralFollowUp_workspaceId_status_idx" ON "PastoralFollowUp"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ChurchResource_name_location_key" ON "ChurchResource"("name", "location");

-- CreateIndex
CREATE INDEX "ResourceBooking_resourceId_startsAt_endsAt_idx" ON "ResourceBooking"("resourceId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "ResourceBooking_workspaceId_status_idx" ON "ResourceBooking"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "File_deletedAt_restoreUntil_idx" ON "File"("deletedAt", "restoreUntil");

-- CreateIndex
CREATE INDEX "File_dlpRestricted_idx" ON "File"("dlpRestricted");

-- CreateIndex
CREATE INDEX "Folder_deletedAt_restoreUntil_idx" ON "Folder"("deletedAt", "restoreUntil");

-- CreateIndex
CREATE INDEX "Notification_deliverAt_deliveredAt_idx" ON "Notification"("deliverAt", "deliveredAt");

-- CreateIndex
CREATE INDEX "Notification_priority_createdAt_idx" ON "Notification"("priority", "createdAt");

-- CreateIndex
CREATE INDEX "Workspace_deletedAt_restoreUntil_idx" ON "Workspace"("deletedAt", "restoreUntil");

-- CreateIndex
CREATE INDEX "Workspace_templateId_idx" ON "Workspace"("templateId");
