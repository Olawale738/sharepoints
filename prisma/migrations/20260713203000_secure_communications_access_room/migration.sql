-- Secure communication delivery monitoring, temporary access, and private leadership document room.
CREATE TYPE "NotificationDeliveryChannel" AS ENUM ('IN_APP', 'EMAIL', 'PUSH', 'WHATSAPP');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'BLOCKED', 'SKIPPED');
CREATE TYPE "LeadershipDocumentStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'REVOKED');

CREATE TABLE "TemporaryWorkspaceAccess" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "grantedById" TEXT NOT NULL,
  "role" "WorkspaceRole" NOT NULL DEFAULT 'user',
  "reason" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TemporaryWorkspaceAccess_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeadershipDocument" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "category" TEXT NOT NULL DEFAULT 'EXECUTIVE',
  "status" "LeadershipDocumentStatus" NOT NULL DEFAULT 'ACTIVE',
  "storageKey" TEXT NOT NULL,
  "fileUrl" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "fileType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "deletedAt" TIMESTAMP(3),
  "deletedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "LeadershipDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationDeliveryEvent" (
  "id" TEXT NOT NULL,
  "notificationId" TEXT,
  "userId" TEXT NOT NULL,
  "channel" "NotificationDeliveryChannel" NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "provider" TEXT,
  "providerMessageId" TEXT,
  "error" TEXT,
  "blockedReason" TEXT,
  "attemptedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "NotificationDeliveryEvent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TemporaryWorkspaceAccess"
  ADD CONSTRAINT "TemporaryWorkspaceAccess_workspaceId_fkey"
  FOREIGN KEY ("workspaceId")
  REFERENCES "Workspace"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "TemporaryWorkspaceAccess"
  ADD CONSTRAINT "TemporaryWorkspaceAccess_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "TemporaryWorkspaceAccess"
  ADD CONSTRAINT "TemporaryWorkspaceAccess_grantedById_fkey"
  FOREIGN KEY ("grantedById")
  REFERENCES "User"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "LeadershipDocument"
  ADD CONSTRAINT "LeadershipDocument_uploadedById_fkey"
  FOREIGN KEY ("uploadedById")
  REFERENCES "User"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "NotificationDeliveryEvent"
  ADD CONSTRAINT "NotificationDeliveryEvent_notificationId_fkey"
  FOREIGN KEY ("notificationId")
  REFERENCES "Notification"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "NotificationDeliveryEvent"
  ADD CONSTRAINT "NotificationDeliveryEvent_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

CREATE UNIQUE INDEX "TemporaryWorkspaceAccess_workspaceId_userId_key" ON "TemporaryWorkspaceAccess"("workspaceId", "userId");
CREATE INDEX "TemporaryWorkspaceAccess_userId_revokedAt_expiresAt_idx" ON "TemporaryWorkspaceAccess"("userId", "revokedAt", "expiresAt");
CREATE INDEX "TemporaryWorkspaceAccess_workspaceId_revokedAt_expiresAt_idx" ON "TemporaryWorkspaceAccess"("workspaceId", "revokedAt", "expiresAt");
CREATE INDEX "TemporaryWorkspaceAccess_grantedById_createdAt_idx" ON "TemporaryWorkspaceAccess"("grantedById", "createdAt");

CREATE UNIQUE INDEX "LeadershipDocument_storageKey_key" ON "LeadershipDocument"("storageKey");
CREATE INDEX "LeadershipDocument_status_createdAt_idx" ON "LeadershipDocument"("status", "createdAt");
CREATE INDEX "LeadershipDocument_category_createdAt_idx" ON "LeadershipDocument"("category", "createdAt");
CREATE INDEX "LeadershipDocument_uploadedById_createdAt_idx" ON "LeadershipDocument"("uploadedById", "createdAt");
CREATE INDEX "LeadershipDocument_deletedAt_idx" ON "LeadershipDocument"("deletedAt");

CREATE INDEX "NotificationDeliveryEvent_notificationId_channel_status_idx" ON "NotificationDeliveryEvent"("notificationId", "channel", "status");
CREATE INDEX "NotificationDeliveryEvent_userId_channel_status_createdAt_idx" ON "NotificationDeliveryEvent"("userId", "channel", "status", "createdAt");
CREATE INDEX "NotificationDeliveryEvent_channel_status_createdAt_idx" ON "NotificationDeliveryEvent"("channel", "status", "createdAt");
CREATE INDEX "NotificationDeliveryEvent_attemptedAt_idx" ON "NotificationDeliveryEvent"("attemptedAt");
