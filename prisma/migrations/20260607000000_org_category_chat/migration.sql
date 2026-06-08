CREATE TYPE "OrgChatAudience" AS ENUM ('ALL', 'ADMIN', 'LEADER', 'MODERATOR', 'USER');

CREATE TABLE "OrgChatRoom" (
    "id" TEXT NOT NULL,
    "audience" "OrgChatAudience" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgChatRoom_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrgChatMessage" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrgChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrgChatRoom_audience_key" ON "OrgChatRoom"("audience");
CREATE INDEX "OrgChatRoom_audience_idx" ON "OrgChatRoom"("audience");
CREATE INDEX "OrgChatRoom_createdAt_idx" ON "OrgChatRoom"("createdAt");
CREATE INDEX "OrgChatMessage_roomId_createdAt_idx" ON "OrgChatMessage"("roomId", "createdAt");
CREATE INDEX "OrgChatMessage_authorId_createdAt_idx" ON "OrgChatMessage"("authorId", "createdAt");

ALTER TABLE "OrgChatRoom" ADD CONSTRAINT "OrgChatRoom_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrgChatMessage" ADD CONSTRAINT "OrgChatMessage_roomId_fkey"
FOREIGN KEY ("roomId") REFERENCES "OrgChatRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrgChatMessage" ADD CONSTRAINT "OrgChatMessage_authorId_fkey"
FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "OrgChatRoom" ("id", "audience", "name", "description", "updatedAt")
VALUES
  ('orgchat_all', 'ALL', 'All members', 'Open to everyone with at least one workspace membership.', CURRENT_TIMESTAMP),
  ('orgchat_admins', 'ADMIN', 'Admins', 'Cross-workspace room for administrators.', CURRENT_TIMESTAMP),
  ('orgchat_leaders', 'LEADER', 'Leaders', 'Cross-workspace room for leaders.', CURRENT_TIMESTAMP),
  ('orgchat_moderators', 'MODERATOR', 'Moderators', 'Cross-workspace room for moderators.', CURRENT_TIMESTAMP),
  ('orgchat_users', 'USER', 'Users', 'Cross-workspace room for ordinary users.', CURRENT_TIMESTAMP)
ON CONFLICT ("audience") DO NOTHING;
