CREATE TYPE "MeetingResponseStatus" AS ENUM ('YES', 'MAYBE', 'NO');

CREATE TABLE "WorkspaceMeetingResponse" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "MeetingResponseStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceMeetingResponse_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkspaceMeetingResponse_meetingId_userId_key" ON "WorkspaceMeetingResponse"("meetingId", "userId");
CREATE INDEX "WorkspaceMeetingResponse_meetingId_status_idx" ON "WorkspaceMeetingResponse"("meetingId", "status");
CREATE INDEX "WorkspaceMeetingResponse_userId_updatedAt_idx" ON "WorkspaceMeetingResponse"("userId", "updatedAt");

ALTER TABLE "WorkspaceMeetingResponse" ADD CONSTRAINT "WorkspaceMeetingResponse_meetingId_fkey"
FOREIGN KEY ("meetingId") REFERENCES "WorkspaceMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceMeetingResponse" ADD CONSTRAINT "WorkspaceMeetingResponse_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
