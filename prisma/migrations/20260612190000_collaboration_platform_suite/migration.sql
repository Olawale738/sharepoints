-- CreateEnum
CREATE TYPE "FileScanStatus" AS ENUM ('PENDING', 'CLEAN', 'INFECTED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "WikiPageStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkspaceFormStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SecurityEventType" ADD VALUE 'TWO_FACTOR_ENABLED';
ALTER TYPE "SecurityEventType" ADD VALUE 'TWO_FACTOR_DISABLED';
ALTER TYPE "SecurityEventType" ADD VALUE 'DEVICE_REVOKED';
ALTER TYPE "SecurityEventType" ADD VALUE 'FILE_BLOCKED';

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "forwardedFromId" TEXT,
ADD COLUMN     "replyToId" TEXT;

-- AlterTable
ALTER TABLE "DirectMessage" ADD COLUMN     "forwardedFromId" TEXT,
ADD COLUMN     "replyToId" TEXT;

-- AlterTable
ALTER TABLE "File" ADD COLUMN     "checkedOutAt" TIMESTAMP(3),
ADD COLUMN     "checkedOutById" TEXT,
ADD COLUMN     "currentVersionNumber" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "legalHold" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "retentionUntil" TIMESTAMP(3),
ADD COLUMN     "scanDetails" TEXT,
ADD COLUMN     "scanStatus" "FileScanStatus" NOT NULL DEFAULT 'SKIPPED';

-- AlterTable
ALTER TABLE "OrgChatMessage" ADD COLUMN     "forwardedFromId" TEXT,
ADD COLUMN     "replyToId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "twoFactorSecret" TEXT;

-- CreateTable
CREATE TABLE "FileVersion" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "changeNote" TEXT,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileComment" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FileComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inAppEnabled" BOOLEAN NOT NULL DEFAULT true,
    "browserEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailMentions" BOOLEAN NOT NULL DEFAULT true,
    "emailTasks" BOOLEAN NOT NULL DEFAULT true,
    "emailMeetings" BOOLEAN NOT NULL DEFAULT true,
    "emailApprovals" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPresence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'online',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPresence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatTypingState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scopeKind" TEXT NOT NULL,
    "scopeId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatTypingState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageReaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageKind" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageReadReceipt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageKind" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReadReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageBookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageKind" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageBookmark_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagePin" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "pinnedById" TEXT NOT NULL,
    "messageKind" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessagePin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceKey" TEXT NOT NULL,
    "name" TEXT,
    "userAgent" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserDevice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WikiPage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "WikiPageStatus" NOT NULL DEFAULT 'DRAFT',
    "authorId" TEXT NOT NULL,
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WikiPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceForm" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "WorkspaceFormStatus" NOT NULL DEFAULT 'DRAFT',
    "fields" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceFormResponse" (
    "id" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "respondentId" TEXT NOT NULL,
    "answers" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceFormResponse_pkey" PRIMARY KEY ("id")
);

-- Backfill every existing document as version 1 so version history is complete
-- immediately after deployment.
INSERT INTO "FileVersion" (
    "id",
    "fileId",
    "versionNumber",
    "storageKey",
    "fileUrl",
    "fileName",
    "fileType",
    "size",
    "changeNote",
    "uploadedById",
    "createdAt"
)
SELECT
    CONCAT('initial_', "id"),
    "id",
    1,
    "storageKey",
    "fileUrl",
    "fileName",
    "fileType",
    "size",
    'Initial document version',
    "uploadedById",
    "createdAt"
FROM "File";

-- CreateIndex
CREATE UNIQUE INDEX "FileVersion_storageKey_key" ON "FileVersion"("storageKey");

-- CreateIndex
CREATE INDEX "FileVersion_fileId_createdAt_idx" ON "FileVersion"("fileId", "createdAt");

-- CreateIndex
CREATE INDEX "FileVersion_uploadedById_idx" ON "FileVersion"("uploadedById");

-- CreateIndex
CREATE UNIQUE INDEX "FileVersion_fileId_versionNumber_key" ON "FileVersion"("fileId", "versionNumber");

-- CreateIndex
CREATE INDEX "FileComment_fileId_createdAt_idx" ON "FileComment"("fileId", "createdAt");

-- CreateIndex
CREATE INDEX "FileComment_authorId_createdAt_idx" ON "FileComment"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_createdAt_idx" ON "Notification"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_workspaceId_createdAt_idx" ON "Notification"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_userId_key" ON "NotificationPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPresence_userId_key" ON "UserPresence"("userId");

-- CreateIndex
CREATE INDEX "UserPresence_lastSeenAt_idx" ON "UserPresence"("lastSeenAt");

-- CreateIndex
CREATE INDEX "ChatTypingState_scopeKind_scopeId_expiresAt_idx" ON "ChatTypingState"("scopeKind", "scopeId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChatTypingState_userId_scopeKind_scopeId_key" ON "ChatTypingState"("userId", "scopeKind", "scopeId");

-- CreateIndex
CREATE INDEX "MessageReaction_messageKind_messageId_idx" ON "MessageReaction"("messageKind", "messageId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageReaction_userId_messageKind_messageId_emoji_key" ON "MessageReaction"("userId", "messageKind", "messageId", "emoji");

-- CreateIndex
CREATE INDEX "MessageReadReceipt_messageKind_messageId_readAt_idx" ON "MessageReadReceipt"("messageKind", "messageId", "readAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageReadReceipt_userId_messageKind_messageId_key" ON "MessageReadReceipt"("userId", "messageKind", "messageId");

-- CreateIndex
CREATE INDEX "MessageBookmark_userId_createdAt_idx" ON "MessageBookmark"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessageBookmark_userId_messageKind_messageId_key" ON "MessageBookmark"("userId", "messageKind", "messageId");

-- CreateIndex
CREATE INDEX "MessagePin_workspaceId_createdAt_idx" ON "MessagePin"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessagePin_messageKind_messageId_key" ON "MessagePin"("messageKind", "messageId");

-- CreateIndex
CREATE INDEX "UserDevice_userId_revokedAt_lastSeenAt_idx" ON "UserDevice"("userId", "revokedAt", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserDevice_userId_deviceKey_key" ON "UserDevice"("userId", "deviceKey");

-- CreateIndex
CREATE INDEX "WikiPage_workspaceId_status_updatedAt_idx" ON "WikiPage"("workspaceId", "status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WikiPage_workspaceId_slug_key" ON "WikiPage"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "WorkspaceForm_workspaceId_status_updatedAt_idx" ON "WorkspaceForm"("workspaceId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "WorkspaceFormResponse_formId_createdAt_idx" ON "WorkspaceFormResponse"("formId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkspaceFormResponse_respondentId_createdAt_idx" ON "WorkspaceFormResponse"("respondentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceFormResponse_formId_respondentId_key" ON "WorkspaceFormResponse"("formId", "respondentId");

-- CreateIndex
CREATE INDEX "ChatMessage_replyToId_idx" ON "ChatMessage"("replyToId");

-- CreateIndex
CREATE INDEX "DirectMessage_replyToId_idx" ON "DirectMessage"("replyToId");

-- CreateIndex
CREATE INDEX "File_checkedOutById_idx" ON "File"("checkedOutById");

-- CreateIndex
CREATE INDEX "File_scanStatus_idx" ON "File"("scanStatus");

-- CreateIndex
CREATE INDEX "File_retentionUntil_idx" ON "File"("retentionUntil");

-- CreateIndex
CREATE INDEX "File_legalHold_idx" ON "File"("legalHold");

-- CreateIndex
CREATE INDEX "OrgChatMessage_replyToId_idx" ON "OrgChatMessage"("replyToId");

-- CreateIndex
CREATE INDEX "User_twoFactorEnabled_idx" ON "User"("twoFactorEnabled");

-- AddForeignKey
ALTER TABLE "File" ADD CONSTRAINT "File_checkedOutById_fkey" FOREIGN KEY ("checkedOutById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileVersion" ADD CONSTRAINT "FileVersion_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileVersion" ADD CONSTRAINT "FileVersion_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileComment" ADD CONSTRAINT "FileComment_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileComment" ADD CONSTRAINT "FileComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPresence" ADD CONSTRAINT "UserPresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatTypingState" ADD CONSTRAINT "ChatTypingState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReaction" ADD CONSTRAINT "MessageReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageReadReceipt" ADD CONSTRAINT "MessageReadReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageBookmark" ADD CONSTRAINT "MessageBookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagePin" ADD CONSTRAINT "MessagePin_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagePin" ADD CONSTRAINT "MessagePin_pinnedById_fkey" FOREIGN KEY ("pinnedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserDevice" ADD CONSTRAINT "UserDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiPage" ADD CONSTRAINT "WikiPage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiPage" ADD CONSTRAINT "WikiPage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiPage" ADD CONSTRAINT "WikiPage_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceForm" ADD CONSTRAINT "WorkspaceForm_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceForm" ADD CONSTRAINT "WorkspaceForm_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceFormResponse" ADD CONSTRAINT "WorkspaceFormResponse_formId_fkey" FOREIGN KEY ("formId") REFERENCES "WorkspaceForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceFormResponse" ADD CONSTRAINT "WorkspaceFormResponse_respondentId_fkey" FOREIGN KEY ("respondentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "DirectConversation_workspaceId_participantAId_participantBId_ke" RENAME TO "DirectConversation_workspaceId_participantAId_participantBI_key";
