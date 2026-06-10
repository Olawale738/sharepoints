DO $$ BEGIN
  CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "DepartmentKind" AS ENUM ('DEPARTMENT', 'MINISTRY_UNIT', 'CATEGORY');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "SecurityEventType" AS ENUM (
    'LOGIN_SUCCESS',
    'LOGIN_FAILED',
    'PASSWORD_RESET',
    'SESSION_REVOKED',
    'FORCE_PASSWORD_RESET',
    'USER_SUSPENDED',
    'USER_RESTORED',
    'ACCESS_REVOKED',
    'USER_DELETED'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "User"
ADD COLUMN "departmentId" TEXT,
ADD COLUMN "category" TEXT,
ADD COLUMN "forcePasswordReset" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "singleActiveSession" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "Department" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" "DepartmentKind" NOT NULL DEFAULT 'DEPARTMENT',
  "description" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Department_name_kind_key" ON "Department"("name", "kind");
CREATE INDEX "Department_kind_idx" ON "Department"("kind");
CREATE INDEX "Department_createdById_idx" ON "Department"("createdById");

ALTER TABLE "Department" ADD CONSTRAINT "Department_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "User" ADD CONSTRAINT "User_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "User_departmentId_idx" ON "User"("departmentId");
CREATE INDEX "User_category_idx" ON "User"("category");
CREATE INDEX "User_forcePasswordReset_idx" ON "User"("forcePasswordReset");
CREATE INDEX "User_singleActiveSession_idx" ON "User"("singleActiveSession");
CREATE INDEX "User_sessionVersion_idx" ON "User"("sessionVersion");

CREATE TABLE "WorkspaceDepartmentAccess" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "canAccessWorkspace" BOOLEAN NOT NULL DEFAULT true,
  "canAccessChat" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceDepartmentAccess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceDepartmentAccess_workspaceId_departmentId_key"
ON "WorkspaceDepartmentAccess"("workspaceId", "departmentId");
CREATE INDEX "WorkspaceDepartmentAccess_departmentId_idx" ON "WorkspaceDepartmentAccess"("departmentId");

ALTER TABLE "WorkspaceDepartmentAccess" ADD CONSTRAINT "WorkspaceDepartmentAccess_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceDepartmentAccess" ADD CONSTRAINT "WorkspaceDepartmentAccess_departmentId_fkey"
FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceMeeting"
ADD COLUMN "agenda" TEXT,
ADD COLUMN "notes" TEXT,
ADD COLUMN "actionItems" TEXT,
ADD COLUMN "recordingUrl" TEXT,
ADD COLUMN "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "approvedById" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "rejectedReason" TEXT;

CREATE INDEX "WorkspaceMeeting_workspaceId_approvalStatus_idx"
ON "WorkspaceMeeting"("workspaceId", "approvalStatus");

ALTER TABLE "WorkspaceAnnouncement"
ADD COLUMN "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "approvedById" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "rejectedReason" TEXT;

CREATE INDEX "WorkspaceAnnouncement_workspaceId_approvalStatus_idx"
ON "WorkspaceAnnouncement"("workspaceId", "approvalStatus");

ALTER TABLE "WorkspaceTask"
ADD COLUMN "priority" "TaskPriority" NOT NULL DEFAULT 'NORMAL',
ADD COLUMN "reminderAt" TIMESTAMP(3),
ADD COLUMN "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "approvedById" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "rejectedReason" TEXT;

CREATE INDEX "WorkspaceTask_workspaceId_approvalStatus_idx" ON "WorkspaceTask"("workspaceId", "approvalStatus");
CREATE INDEX "WorkspaceTask_workspaceId_priority_idx" ON "WorkspaceTask"("workspaceId", "priority");
CREATE INDEX "WorkspaceTask_reminderAt_idx" ON "WorkspaceTask"("reminderAt");

CREATE TABLE "WorkspaceTaskAssignee" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceTaskAssignee_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceTaskAssignee_taskId_userId_key" ON "WorkspaceTaskAssignee"("taskId", "userId");
CREATE INDEX "WorkspaceTaskAssignee_userId_idx" ON "WorkspaceTaskAssignee"("userId");

ALTER TABLE "WorkspaceTaskAssignee" ADD CONSTRAINT "WorkspaceTaskAssignee_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "WorkspaceTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceTaskAssignee" ADD CONSTRAINT "WorkspaceTaskAssignee_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "WorkspaceTaskAssignee" ("id", "taskId", "userId")
SELECT 'migrated_' || "id" || '_' || "assignedToId", "id", "assignedToId"
FROM "WorkspaceTask"
WHERE "assignedToId" IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE TABLE "WorkspaceTaskComment" (
  "id" TEXT NOT NULL,
  "taskId" TEXT NOT NULL,
  "authorId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WorkspaceTaskComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WorkspaceTaskComment_taskId_createdAt_idx" ON "WorkspaceTaskComment"("taskId", "createdAt");
CREATE INDEX "WorkspaceTaskComment_authorId_createdAt_idx" ON "WorkspaceTaskComment"("authorId", "createdAt");

ALTER TABLE "WorkspaceTaskComment" ADD CONSTRAINT "WorkspaceTaskComment_taskId_fkey"
FOREIGN KEY ("taskId") REFERENCES "WorkspaceTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceTaskComment" ADD CONSTRAINT "WorkspaceTaskComment_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "File"
ADD COLUMN "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN "approvedById" TEXT,
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "rejectedReason" TEXT;

CREATE INDEX "File_workspaceId_approvalStatus_idx" ON "File"("workspaceId", "approvalStatus");

CREATE TABLE "ApprovalRequest" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "reviewerId" TEXT,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ApprovalRequest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ApprovalRequest_targetType_targetId_key" ON "ApprovalRequest"("targetType", "targetId");
CREATE INDEX "ApprovalRequest_workspaceId_status_createdAt_idx" ON "ApprovalRequest"("workspaceId", "status", "createdAt");
CREATE INDEX "ApprovalRequest_requesterId_createdAt_idx" ON "ApprovalRequest"("requesterId", "createdAt");
CREATE INDEX "ApprovalRequest_reviewerId_reviewedAt_idx" ON "ApprovalRequest"("reviewerId", "reviewedAt");

ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_requesterId_fkey"
FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApprovalRequest" ADD CONSTRAINT "ApprovalRequest_reviewerId_fkey"
FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "SecurityEvent" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "type" "SecurityEventType" NOT NULL,
  "email" TEXT,
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SecurityEvent_userId_createdAt_idx" ON "SecurityEvent"("userId", "createdAt");
CREATE INDEX "SecurityEvent_email_createdAt_idx" ON "SecurityEvent"("email", "createdAt");
CREATE INDEX "SecurityEvent_type_createdAt_idx" ON "SecurityEvent"("type", "createdAt");

ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
