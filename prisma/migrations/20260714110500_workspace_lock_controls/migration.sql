-- Add president-controlled workspace lock fields
ALTER TABLE "Workspace"
  ADD COLUMN "lockedAt" TIMESTAMP(3),
  ADD COLUMN "lockedById" TEXT,
  ADD COLUMN "lockReason" TEXT;

CREATE INDEX "Workspace_lockedAt_idx" ON "Workspace"("lockedAt");
