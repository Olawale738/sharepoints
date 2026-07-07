CREATE TYPE "WhatsAppMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

CREATE TYPE "WhatsAppMessageStatus" AS ENUM ('RECEIVED', 'SENT', 'DELIVERED', 'READ', 'FAILED');

CREATE TABLE "WhatsAppConversation" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "workspaceId" TEXT,
  "phone" TEXT NOT NULL,
  "displayName" TEXT,
  "lastMessageAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WhatsAppConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WhatsAppMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "userId" TEXT,
  "workspaceId" TEXT,
  "direction" "WhatsAppMessageDirection" NOT NULL,
  "status" "WhatsAppMessageStatus" NOT NULL DEFAULT 'RECEIVED',
  "providerId" TEXT,
  "fromPhone" TEXT,
  "toPhone" TEXT,
  "messageType" TEXT NOT NULL,
  "body" TEXT,
  "mediaId" TEXT,
  "mediaMimeType" TEXT,
  "mediaSha256" TEXT,
  "rawPayload" JSONB,
  "sentById" TEXT,
  "receivedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WhatsAppMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WhatsAppConversation_phone_key" ON "WhatsAppConversation"("phone");
CREATE INDEX "WhatsAppConversation_userId_lastMessageAt_idx" ON "WhatsAppConversation"("userId", "lastMessageAt");
CREATE INDEX "WhatsAppConversation_workspaceId_lastMessageAt_idx" ON "WhatsAppConversation"("workspaceId", "lastMessageAt");
CREATE INDEX "WhatsAppConversation_lastMessageAt_idx" ON "WhatsAppConversation"("lastMessageAt");

CREATE UNIQUE INDEX "WhatsAppMessage_providerId_key" ON "WhatsAppMessage"("providerId");
CREATE INDEX "WhatsAppMessage_conversationId_createdAt_idx" ON "WhatsAppMessage"("conversationId", "createdAt");
CREATE INDEX "WhatsAppMessage_userId_createdAt_idx" ON "WhatsAppMessage"("userId", "createdAt");
CREATE INDEX "WhatsAppMessage_workspaceId_createdAt_idx" ON "WhatsAppMessage"("workspaceId", "createdAt");
CREATE INDEX "WhatsAppMessage_direction_status_createdAt_idx" ON "WhatsAppMessage"("direction", "status", "createdAt");
