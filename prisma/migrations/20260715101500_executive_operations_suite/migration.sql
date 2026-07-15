-- Create enums for executive operations
CREATE TYPE "PrayerAssignmentStatus" AS ENUM (
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETED',
  'TESTIMONY_RECORDED',
  'CANCELLED'
);

CREATE TYPE "CalendarConflictStatus" AS ENUM (
  'OPEN',
  'ACKNOWLEDGED',
  'RESOLVED',
  'DISMISSED'
);

CREATE TYPE "ExternalGuestStatus" AS ENUM (
  'ACTIVE',
  'EXPIRED',
  'REVOKED'
);

CREATE TYPE "PresidentDelegationStatus" AS ENUM (
  'ACTIVE',
  'EXPIRED',
  'REVOKED'
);

-- Prayer assignment system
CREATE TABLE "PrayerAssignment" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "organizationUnitId" TEXT,
  "departmentId" TEXT,
  "assignedToUserId" TEXT,
  "assignedWorkspaceId" TEXT,
  "assignedOrganizationUnitId" TEXT,
  "assignedDepartmentId" TEXT,
  "title" TEXT NOT NULL,
  "prayerPoint" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'GENERAL',
  "priority" "GrowthPriority" NOT NULL DEFAULT 'NORMAL',
  "status" "PrayerAssignmentStatus" NOT NULL DEFAULT 'ASSIGNED',
  "dueAt" TIMESTAMP(3),
  "completionNotes" TEXT,
  "testimony" TEXT,
  "completedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "updatedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PrayerAssignment_pkey" PRIMARY KEY ("id")
);

-- Calendar intelligence conflict records
CREATE TABLE "ChurchCalendarConflict" (
  "id" TEXT NOT NULL,
  "conflictType" TEXT NOT NULL,
  "severity" "GrowthPriority" NOT NULL DEFAULT 'NORMAL',
  "title" TEXT NOT NULL,
  "details" TEXT NOT NULL,
  "firstKind" TEXT NOT NULL,
  "firstId" TEXT NOT NULL,
  "secondKind" TEXT NOT NULL,
  "secondId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "organizationUnitId" TEXT,
  "resourceId" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" "CalendarConflictStatus" NOT NULL DEFAULT 'OPEN',
  "detectedById" TEXT NOT NULL,
  "resolvedById" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ChurchCalendarConflict_pkey" PRIMARY KEY ("id")
);

-- External guest portal tokens
CREATE TABLE "ExternalGuestAccess" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "organization" TEXT,
  "guestType" TEXT NOT NULL DEFAULT 'PARTNER',
  "purpose" TEXT NOT NULL,
  "status" "ExternalGuestStatus" NOT NULL DEFAULT 'ACTIVE',
  "token" TEXT NOT NULL,
  "workspaceId" TEXT,
  "fileId" TEXT,
  "grantedById" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  "lastViewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ExternalGuestAccess_pkey" PRIMARY KEY ("id")
);

-- President delegation center
CREATE TABLE "PresidentDelegation" (
  "id" TEXT NOT NULL,
  "delegatedToId" TEXT NOT NULL,
  "grantedById" TEXT NOT NULL,
  "status" "PresidentDelegationStatus" NOT NULL DEFAULT 'ACTIVE',
  "canIssueCertificates" BOOLEAN NOT NULL DEFAULT false,
  "canIssueIdCards" BOOLEAN NOT NULL DEFAULT false,
  "canIssueLetters" BOOLEAN NOT NULL DEFAULT false,
  "canManagePrayerAssignments" BOOLEAN NOT NULL DEFAULT false,
  "canResolveCalendarConflicts" BOOLEAN NOT NULL DEFAULT false,
  "canManageExternalGuests" BOOLEAN NOT NULL DEFAULT false,
  "canRunSystemCleanup" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT,
  "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PresidentDelegation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PrayerAssignment_workspaceId_status_dueAt_idx" ON "PrayerAssignment"("workspaceId", "status", "dueAt");
CREATE INDEX "PrayerAssignment_organizationUnitId_status_dueAt_idx" ON "PrayerAssignment"("organizationUnitId", "status", "dueAt");
CREATE INDEX "PrayerAssignment_departmentId_status_idx" ON "PrayerAssignment"("departmentId", "status");
CREATE INDEX "PrayerAssignment_assignedToUserId_status_dueAt_idx" ON "PrayerAssignment"("assignedToUserId", "status", "dueAt");
CREATE INDEX "PrayerAssignment_assignedWorkspaceId_status_dueAt_idx" ON "PrayerAssignment"("assignedWorkspaceId", "status", "dueAt");
CREATE INDEX "PrayerAssignment_assignedOrganizationUnitId_status_dueAt_idx" ON "PrayerAssignment"("assignedOrganizationUnitId", "status", "dueAt");
CREATE INDEX "PrayerAssignment_assignedDepartmentId_status_idx" ON "PrayerAssignment"("assignedDepartmentId", "status");
CREATE INDEX "PrayerAssignment_createdById_createdAt_idx" ON "PrayerAssignment"("createdById", "createdAt");

CREATE INDEX "ChurchCalendarConflict_status_severity_startsAt_idx" ON "ChurchCalendarConflict"("status", "severity", "startsAt");
CREATE INDEX "ChurchCalendarConflict_workspaceId_status_startsAt_idx" ON "ChurchCalendarConflict"("workspaceId", "status", "startsAt");
CREATE INDEX "ChurchCalendarConflict_organizationUnitId_status_startsAt_idx" ON "ChurchCalendarConflict"("organizationUnitId", "status", "startsAt");
CREATE INDEX "ChurchCalendarConflict_resourceId_status_startsAt_idx" ON "ChurchCalendarConflict"("resourceId", "status", "startsAt");
CREATE INDEX "ChurchCalendarConflict_detectedById_createdAt_idx" ON "ChurchCalendarConflict"("detectedById", "createdAt");

CREATE UNIQUE INDEX "ExternalGuestAccess_token_key" ON "ExternalGuestAccess"("token");
CREATE INDEX "ExternalGuestAccess_email_status_expiresAt_idx" ON "ExternalGuestAccess"("email", "status", "expiresAt");
CREATE INDEX "ExternalGuestAccess_workspaceId_status_expiresAt_idx" ON "ExternalGuestAccess"("workspaceId", "status", "expiresAt");
CREATE INDEX "ExternalGuestAccess_fileId_status_expiresAt_idx" ON "ExternalGuestAccess"("fileId", "status", "expiresAt");
CREATE INDEX "ExternalGuestAccess_grantedById_createdAt_idx" ON "ExternalGuestAccess"("grantedById", "createdAt");

CREATE INDEX "PresidentDelegation_delegatedToId_status_expiresAt_idx" ON "PresidentDelegation"("delegatedToId", "status", "expiresAt");
CREATE INDEX "PresidentDelegation_grantedById_createdAt_idx" ON "PresidentDelegation"("grantedById", "createdAt");
CREATE INDEX "PresidentDelegation_revokedAt_expiresAt_idx" ON "PresidentDelegation"("revokedAt", "expiresAt");
