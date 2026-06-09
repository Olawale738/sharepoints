CREATE TABLE "WorkspaceMeeting" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "roomName" TEXT NOT NULL,
    "passcode" TEXT NOT NULL,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceMeeting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceMeeting_roomName_key" ON "WorkspaceMeeting"("roomName");
CREATE INDEX "WorkspaceMeeting_workspaceId_startsAt_idx" ON "WorkspaceMeeting"("workspaceId", "startsAt");
CREATE INDEX "WorkspaceMeeting_createdById_startsAt_idx" ON "WorkspaceMeeting"("createdById", "startsAt");
CREATE INDEX "WorkspaceMeeting_cancelledAt_idx" ON "WorkspaceMeeting"("cancelledAt");

ALTER TABLE "WorkspaceMeeting" ADD CONSTRAINT "WorkspaceMeeting_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceMeeting" ADD CONSTRAINT "WorkspaceMeeting_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
