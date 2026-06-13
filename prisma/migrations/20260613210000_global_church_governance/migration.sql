CREATE TYPE "OrganizationUnitType" AS ENUM ('GLOBAL', 'COUNTRY', 'REGION', 'BRANCH', 'CHURCH', 'MINISTRY');
CREATE TYPE "SafeguardingCaseStatus" AS ENUM ('OPEN', 'TRIAGE', 'ACTIVE', 'MONITORING', 'CLOSED');
CREATE TYPE "SafeguardingSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "FreshnessIssueType" AS ENUM ('STALE', 'DUPLICATE', 'MISSING_OWNER', 'BROKEN_LINK', 'REVIEW_DUE');
CREATE TYPE "FreshnessIssueStatus" AS ENUM ('OPEN', 'REVIEWED', 'RESOLVED', 'DISMISSED');
CREATE TYPE "CommunicationSafetyCategory" AS ENUM ('THREAT', 'HARASSMENT', 'SAFEGUARDING', 'CONFIDENTIAL_DATA', 'SELF_HARM', 'OTHER');
CREATE TYPE "CommunicationSafetyStatus" AS ENUM ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED');
CREATE TYPE "EmergencyIncidentStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RESOLVED', 'CANCELLED');
CREATE TYPE "WelfareResponseStatus" AS ENUM ('SAFE', 'NEEDS_HELP', 'NO_RESPONSE');
CREATE TYPE "MembershipCardStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REVOKED');
CREATE TYPE "GovernanceHoldStatus" AS ENUM ('ACTIVE', 'RELEASED');
CREATE TYPE "ResourceCheckInStatus" AS ENUM ('CHECKED_IN', 'CHECKED_OUT');

ALTER TABLE "Workspace"
ADD COLUMN "organizationUnitId" TEXT,
ADD COLUMN "scopeType" "OrganizationUnitType";

CREATE INDEX "Workspace_organizationUnitId_scopeType_idx"
ON "Workspace"("organizationUnitId", "scopeType");

CREATE TABLE "OrganizationUnit" (
  "id" TEXT NOT NULL,
  "parentId" TEXT,
  "type" "OrganizationUnitType" NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "countryCode" TEXT,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationUnit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrganizationUnit_code_key" ON "OrganizationUnit"("code");
CREATE UNIQUE INDEX "OrganizationUnit_parentId_type_name_key" ON "OrganizationUnit"("parentId", "type", "name");
CREATE INDEX "OrganizationUnit_parentId_type_active_idx" ON "OrganizationUnit"("parentId", "type", "active");
CREATE INDEX "OrganizationUnit_countryCode_type_idx" ON "OrganizationUnit"("countryCode", "type");

CREATE TABLE "OrganizationUnitLeader" (
  "id" TEXT NOT NULL,
  "unitId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "canCreateWorkspaces" BOOLEAN NOT NULL DEFAULT true,
  "inheritToChildren" BOOLEAN NOT NULL DEFAULT true,
  "assignedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrganizationUnitLeader_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrganizationUnitLeader_unitId_userId_title_key" ON "OrganizationUnitLeader"("unitId", "userId", "title");
CREATE INDEX "OrganizationUnitLeader_userId_canCreateWorkspaces_idx" ON "OrganizationUnitLeader"("userId", "canCreateWorkspaces");
CREATE INDEX "OrganizationUnitLeader_unitId_inheritToChildren_idx" ON "OrganizationUnitLeader"("unitId", "inheritToChildren");

CREATE TABLE "SafeguardingCase" (
  "id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "organizationUnitId" TEXT,
  "workspaceId" TEXT,
  "subjectName" TEXT NOT NULL,
  "subjectUserId" TEXT,
  "category" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "privateNotes" TEXT,
  "severity" "SafeguardingSeverity" NOT NULL,
  "status" "SafeguardingCaseStatus" NOT NULL DEFAULT 'OPEN',
  "assignedToId" TEXT,
  "reviewerId" TEXT,
  "reportedById" TEXT NOT NULL,
  "nextReviewAt" TIMESTAMP(3),
  "closedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SafeguardingCase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SafeguardingCase_reference_key" ON "SafeguardingCase"("reference");
CREATE INDEX "SafeguardingCase_organizationUnitId_status_severity_idx" ON "SafeguardingCase"("organizationUnitId", "status", "severity");
CREATE INDEX "SafeguardingCase_assignedToId_status_idx" ON "SafeguardingCase"("assignedToId", "status");
CREATE INDEX "SafeguardingCase_workspaceId_status_idx" ON "SafeguardingCase"("workspaceId", "status");

CREATE TABLE "WorkspaceAiAgent" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "instructions" TEXT NOT NULL,
  "workspaceId" TEXT,
  "organizationUnitId" TEXT,
  "allowedSourceTypes" JSONB NOT NULL,
  "createdById" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkspaceAiAgent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkspaceAiAgent_workspaceId_name_key" ON "WorkspaceAiAgent"("workspaceId", "name");
CREATE INDEX "WorkspaceAiAgent_organizationUnitId_enabled_idx" ON "WorkspaceAiAgent"("organizationUnitId", "enabled");
CREATE INDEX "WorkspaceAiAgent_createdById_enabled_idx" ON "WorkspaceAiAgent"("createdById", "enabled");

CREATE TABLE "ContentFreshnessIssue" (
  "id" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "issueType" "FreshnessIssueType" NOT NULL,
  "title" TEXT NOT NULL,
  "details" TEXT,
  "ownerId" TEXT,
  "lastUpdatedAt" TIMESTAMP(3),
  "reviewDueAt" TIMESTAMP(3),
  "status" "FreshnessIssueStatus" NOT NULL DEFAULT 'OPEN',
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContentFreshnessIssue_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ContentFreshnessIssue_sourceType_sourceId_issueType_key" ON "ContentFreshnessIssue"("sourceType", "sourceId", "issueType");
CREATE INDEX "ContentFreshnessIssue_workspaceId_status_issueType_idx" ON "ContentFreshnessIssue"("workspaceId", "status", "issueType");
CREATE INDEX "ContentFreshnessIssue_reviewDueAt_status_idx" ON "ContentFreshnessIssue"("reviewDueAt", "status");

CREATE TABLE "CommunicationSafetyCase" (
  "id" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "category" "CommunicationSafetyCategory" NOT NULL,
  "severity" "SafeguardingSeverity" NOT NULL,
  "summary" TEXT NOT NULL,
  "status" "CommunicationSafetyStatus" NOT NULL DEFAULT 'OPEN',
  "reviewerId" TEXT,
  "resolutionNote" TEXT,
  "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommunicationSafetyCase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CommunicationSafetyCase_sourceType_sourceId_category_key" ON "CommunicationSafetyCase"("sourceType", "sourceId", "category");
CREATE INDEX "CommunicationSafetyCase_workspaceId_status_severity_idx" ON "CommunicationSafetyCase"("workspaceId", "status", "severity");
CREATE INDEX "CommunicationSafetyCase_reviewerId_status_idx" ON "CommunicationSafetyCase"("reviewerId", "status");

CREATE TABLE "EmergencyIncident" (
  "id" TEXT NOT NULL,
  "organizationUnitId" TEXT,
  "workspaceId" TEXT,
  "title" TEXT NOT NULL,
  "instructions" TEXT NOT NULL,
  "severity" "SafeguardingSeverity" NOT NULL,
  "status" "EmergencyIncidentStatus" NOT NULL DEFAULT 'DRAFT',
  "location" TEXT,
  "createdById" TEXT NOT NULL,
  "activatedAt" TIMESTAMP(3),
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmergencyIncident_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "EmergencyIncident_organizationUnitId_status_severity_idx" ON "EmergencyIncident"("organizationUnitId", "status", "severity");
CREATE INDEX "EmergencyIncident_workspaceId_status_idx" ON "EmergencyIncident"("workspaceId", "status");

CREATE TABLE "EmergencyWelfareResponse" (
  "id" TEXT NOT NULL,
  "incidentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "status" "WelfareResponseStatus" NOT NULL,
  "note" TEXT,
  "respondedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EmergencyWelfareResponse_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EmergencyWelfareResponse_incidentId_userId_key" ON "EmergencyWelfareResponse"("incidentId", "userId");
CREATE INDEX "EmergencyWelfareResponse_incidentId_status_idx" ON "EmergencyWelfareResponse"("incidentId", "status");
CREATE INDEX "EmergencyWelfareResponse_userId_respondedAt_idx" ON "EmergencyWelfareResponse"("userId", "respondedAt");

CREATE TABLE "DigitalMembershipCard" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "qrToken" TEXT NOT NULL,
  "cardNumber" TEXT NOT NULL,
  "status" "MembershipCardStatus" NOT NULL DEFAULT 'ACTIVE',
  "issuedById" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DigitalMembershipCard_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DigitalMembershipCard_userId_key" ON "DigitalMembershipCard"("userId");
CREATE UNIQUE INDEX "DigitalMembershipCard_qrToken_key" ON "DigitalMembershipCard"("qrToken");
CREATE UNIQUE INDEX "DigitalMembershipCard_cardNumber_key" ON "DigitalMembershipCard"("cardNumber");
CREATE INDEX "DigitalMembershipCard_status_expiresAt_idx" ON "DigitalMembershipCard"("status", "expiresAt");

CREATE TABLE "GovernanceHold" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "targetType" TEXT NOT NULL,
  "targetId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "reason" TEXT NOT NULL,
  "status" "GovernanceHoldStatus" NOT NULL DEFAULT 'ACTIVE',
  "preserveUntil" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "releasedById" TEXT,
  "releasedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GovernanceHold_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GovernanceHold_targetType_targetId_status_idx" ON "GovernanceHold"("targetType", "targetId", "status");
CREATE INDEX "GovernanceHold_workspaceId_status_idx" ON "GovernanceHold"("workspaceId", "status");
CREATE INDEX "GovernanceHold_preserveUntil_status_idx" ON "GovernanceHold"("preserveUntil", "status");

CREATE TABLE "SmartResourcePass" (
  "id" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "qrToken" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SmartResourcePass_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SmartResourcePass_resourceId_key" ON "SmartResourcePass"("resourceId");
CREATE UNIQUE INDEX "SmartResourcePass_qrToken_key" ON "SmartResourcePass"("qrToken");

CREATE TABLE "ResourceCheckIn" (
  "id" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "bookingId" TEXT,
  "userId" TEXT NOT NULL,
  "status" "ResourceCheckInStatus" NOT NULL DEFAULT 'CHECKED_IN',
  "checkedInAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "checkedOutAt" TIMESTAMP(3),
  "note" TEXT,
  CONSTRAINT "ResourceCheckIn_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ResourceCheckIn_resourceId_status_checkedInAt_idx" ON "ResourceCheckIn"("resourceId", "status", "checkedInAt");
CREATE INDEX "ResourceCheckIn_userId_checkedInAt_idx" ON "ResourceCheckIn"("userId", "checkedInAt");
CREATE INDEX "ResourceCheckIn_bookingId_idx" ON "ResourceCheckIn"("bookingId");
