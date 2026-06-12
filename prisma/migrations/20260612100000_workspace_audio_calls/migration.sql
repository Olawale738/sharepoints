DO $$ BEGIN
  CREATE TYPE "MeetingType" AS ENUM ('AUDIO', 'VIDEO');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "WorkspaceMeeting"
ADD COLUMN "meetingType" "MeetingType" NOT NULL DEFAULT 'VIDEO';

CREATE INDEX "WorkspaceMeeting_workspaceId_meetingType_startsAt_idx"
ON "WorkspaceMeeting"("workspaceId", "meetingType", "startsAt");
