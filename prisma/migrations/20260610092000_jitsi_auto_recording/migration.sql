ALTER TABLE "WorkspaceMeeting"
ADD COLUMN "autoRecord" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "recordingMode" TEXT NOT NULL DEFAULT 'file',
ADD COLUMN "recordingStatus" TEXT,
ADD COLUMN "recordingError" TEXT,
ADD COLUMN "recordingStartedAt" TIMESTAMP(3);

CREATE INDEX "WorkspaceMeeting_autoRecord_idx" ON "WorkspaceMeeting"("autoRecord");
