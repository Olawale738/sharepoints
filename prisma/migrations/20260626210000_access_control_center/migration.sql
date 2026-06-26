CREATE TYPE "AccessPointType" AS ENUM ('ENTRANCE', 'DOOR', 'ROOM', 'DESK', 'CABINET', 'EQUIPMENT', 'VEHICLE', 'KEY_BOX', 'COMPUTER', 'OTHER');
CREATE TYPE "AccessMethod" AS ENUM ('QR', 'NFC_RFID', 'MANUAL', 'HARDWARE_API');
CREATE TYPE "AccessRuleSubjectType" AS ENUM ('ALL_ACTIVE', 'USER', 'ROLE', 'DEPARTMENT', 'CATEGORY', 'WORKSPACE', 'ORGANIZATION_UNIT');
CREATE TYPE "AccessDecision" AS ENUM ('GRANTED', 'DENIED', 'NEEDS_REVIEW');

CREATE TABLE "AccessPoint" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "pointType" "AccessPointType" NOT NULL,
  "location" TEXT,
  "description" TEXT,
  "workspaceId" TEXT,
  "organizationUnitId" TEXT,
  "resourceId" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "requireLiveCard" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccessPoint_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccessPoint_workspaceId_active_idx" ON "AccessPoint"("workspaceId", "active");
CREATE INDEX "AccessPoint_organizationUnitId_active_idx" ON "AccessPoint"("organizationUnitId", "active");
CREATE INDEX "AccessPoint_resourceId_active_idx" ON "AccessPoint"("resourceId", "active");
CREATE INDEX "AccessPoint_pointType_active_idx" ON "AccessPoint"("pointType", "active");

CREATE TABLE "AccessRule" (
  "id" TEXT NOT NULL,
  "accessPointId" TEXT NOT NULL,
  "subjectType" "AccessRuleSubjectType" NOT NULL,
  "subjectId" TEXT,
  "role" TEXT,
  "canAccess" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 100,
  "validFrom" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "timeStart" TEXT,
  "timeEnd" TEXT,
  "weekdays" JSONB,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccessRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccessRule_accessPointId_priority_idx" ON "AccessRule"("accessPointId", "priority");
CREATE INDEX "AccessRule_subjectType_subjectId_idx" ON "AccessRule"("subjectType", "subjectId");
CREATE INDEX "AccessRule_role_idx" ON "AccessRule"("role");

CREATE TABLE "AccessHardwareDevice" (
  "id" TEXT NOT NULL,
  "accessPointId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'generic',
  "deviceIdentifier" TEXT,
  "apiEndpoint" TEXT,
  "sharedSecretHash" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastSeenAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AccessHardwareDevice_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccessHardwareDevice_accessPointId_active_idx" ON "AccessHardwareDevice"("accessPointId", "active");
CREATE INDEX "AccessHardwareDevice_provider_deviceIdentifier_idx" ON "AccessHardwareDevice"("provider", "deviceIdentifier");

CREATE TABLE "AccessScanLog" (
  "id" TEXT NOT NULL,
  "accessPointId" TEXT NOT NULL,
  "cardId" TEXT,
  "organizationId" TEXT,
  "scannedUserId" TEXT,
  "method" "AccessMethod" NOT NULL,
  "decision" "AccessDecision" NOT NULL,
  "reason" TEXT NOT NULL,
  "scannedById" TEXT,
  "deviceId" TEXT,
  "ipHash" TEXT,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AccessScanLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AccessScanLog_accessPointId_createdAt_idx" ON "AccessScanLog"("accessPointId", "createdAt");
CREATE INDEX "AccessScanLog_scannedUserId_createdAt_idx" ON "AccessScanLog"("scannedUserId", "createdAt");
CREATE INDEX "AccessScanLog_organizationId_createdAt_idx" ON "AccessScanLog"("organizationId", "createdAt");
CREATE INDEX "AccessScanLog_decision_createdAt_idx" ON "AccessScanLog"("decision", "createdAt");
CREATE INDEX "AccessScanLog_deviceId_createdAt_idx" ON "AccessScanLog"("deviceId", "createdAt");
