CREATE TABLE "DirectConversation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT,
    "participantAId" TEXT NOT NULL,
    "participantBId" TEXT NOT NULL,
    "lastMessageAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DirectMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DirectMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DirectConversation_workspaceId_participantAId_participantBId_key"
ON "DirectConversation"("workspaceId", "participantAId", "participantBId");

CREATE INDEX "DirectConversation_workspaceId_updatedAt_idx"
ON "DirectConversation"("workspaceId", "updatedAt");

CREATE INDEX "DirectConversation_participantAId_updatedAt_idx"
ON "DirectConversation"("participantAId", "updatedAt");

CREATE INDEX "DirectConversation_participantBId_updatedAt_idx"
ON "DirectConversation"("participantBId", "updatedAt");

CREATE INDEX "DirectMessage_conversationId_createdAt_idx"
ON "DirectMessage"("conversationId", "createdAt");

CREATE INDEX "DirectMessage_authorId_createdAt_idx"
ON "DirectMessage"("authorId", "createdAt");

ALTER TABLE "DirectConversation" ADD CONSTRAINT "DirectConversation_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DirectConversation" ADD CONSTRAINT "DirectConversation_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "DirectConversation" ADD CONSTRAINT "DirectConversation_participantAId_fkey"
FOREIGN KEY ("participantAId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DirectConversation" ADD CONSTRAINT "DirectConversation_participantBId_fkey"
FOREIGN KEY ("participantBId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "DirectConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DirectMessage" ADD CONSTRAINT "DirectMessage_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
