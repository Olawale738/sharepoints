ALTER TABLE "ChatMessage"
ADD COLUMN "voiceStorageKey" TEXT,
ADD COLUMN "voiceMimeType" TEXT,
ADD COLUMN "voiceSize" INTEGER,
ADD COLUMN "voiceDurationMs" INTEGER;

ALTER TABLE "DirectMessage"
ADD COLUMN "voiceStorageKey" TEXT,
ADD COLUMN "voiceMimeType" TEXT,
ADD COLUMN "voiceSize" INTEGER,
ADD COLUMN "voiceDurationMs" INTEGER;

ALTER TABLE "OrgChatMessage"
ADD COLUMN "voiceStorageKey" TEXT,
ADD COLUMN "voiceMimeType" TEXT,
ADD COLUMN "voiceSize" INTEGER,
ADD COLUMN "voiceDurationMs" INTEGER;

CREATE UNIQUE INDEX "ChatMessage_voiceStorageKey_key" ON "ChatMessage"("voiceStorageKey");
CREATE UNIQUE INDEX "DirectMessage_voiceStorageKey_key" ON "DirectMessage"("voiceStorageKey");
CREATE UNIQUE INDEX "OrgChatMessage_voiceStorageKey_key" ON "OrgChatMessage"("voiceStorageKey");
