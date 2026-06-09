ALTER TABLE "ChatMessage" ADD COLUMN "editedAt" TIMESTAMP(3);
ALTER TABLE "ChatMessage" ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "DirectMessage" ADD COLUMN "editedAt" TIMESTAMP(3);
ALTER TABLE "DirectMessage" ADD COLUMN "deletedAt" TIMESTAMP(3);

ALTER TABLE "OrgChatMessage" ADD COLUMN "editedAt" TIMESTAMP(3);
ALTER TABLE "OrgChatMessage" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "ChatMessage_deletedAt_idx" ON "ChatMessage"("deletedAt");
CREATE INDEX "DirectMessage_deletedAt_idx" ON "DirectMessage"("deletedAt");
CREATE INDEX "OrgChatMessage_deletedAt_idx" ON "OrgChatMessage"("deletedAt");
