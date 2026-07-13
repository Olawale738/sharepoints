-- Request-access workflow for workspaces and files.
CREATE TYPE "AccessRequestTargetType" AS ENUM ('WORKSPACE', 'FILE');
CREATE TYPE "AccessRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "AccessRequest" (
  "id" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "reviewerId" TEXT,
  "workspaceId" TEXT NOT NULL,
  "fileId" TEXT,
  "targetType" "AccessRequestTargetType" NOT NULL,
  "targetId" TEXT NOT NULL,
  "requestedRole" "WorkspaceRole" NOT NULL DEFAULT 'viewer',
  "status" "AccessRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "decisionReason" TEXT,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FileAccessGrant" (
  "id" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "grantedById" TEXT NOT NULL,
  "accessLevel" TEXT NOT NULL DEFAULT 'VIEW',
  "expiresAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "FileAccessGrant_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AccessRequest"
  ADD CONSTRAINT "AccessRequest_requesterId_fkey"
  FOREIGN KEY ("requesterId")
  REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "AccessRequest"
  ADD CONSTRAINT "AccessRequest_reviewerId_fkey"
  FOREIGN KEY ("reviewerId")
  REFERENCES "User"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "AccessRequest"
  ADD CONSTRAINT "AccessRequest_workspaceId_fkey"
  FOREIGN KEY ("workspaceId")
  REFERENCES "Workspace"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "AccessRequest"
  ADD CONSTRAINT "AccessRequest_fileId_fkey"
  FOREIGN KEY ("fileId")
  REFERENCES "File"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

ALTER TABLE "FileAccessGrant"
  ADD CONSTRAINT "FileAccessGrant_fileId_fkey"
  FOREIGN KEY ("fileId")
  REFERENCES "File"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "FileAccessGrant"
  ADD CONSTRAINT "FileAccessGrant_userId_fkey"
  FOREIGN KEY ("userId")
  REFERENCES "User"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "FileAccessGrant"
  ADD CONSTRAINT "FileAccessGrant_grantedById_fkey"
  FOREIGN KEY ("grantedById")
  REFERENCES "User"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

CREATE INDEX "AccessRequest_workspaceId_status_createdAt_idx" ON "AccessRequest"("workspaceId", "status", "createdAt");
CREATE INDEX "AccessRequest_requesterId_status_createdAt_idx" ON "AccessRequest"("requesterId", "status", "createdAt");
CREATE INDEX "AccessRequest_targetType_targetId_status_idx" ON "AccessRequest"("targetType", "targetId", "status");
CREATE INDEX "AccessRequest_fileId_status_idx" ON "AccessRequest"("fileId", "status");
CREATE INDEX "AccessRequest_reviewerId_decidedAt_idx" ON "AccessRequest"("reviewerId", "decidedAt");

CREATE UNIQUE INDEX "FileAccessGrant_fileId_userId_key" ON "FileAccessGrant"("fileId", "userId");
CREATE INDEX "FileAccessGrant_userId_revokedAt_expiresAt_idx" ON "FileAccessGrant"("userId", "revokedAt", "expiresAt");
CREATE INDEX "FileAccessGrant_fileId_revokedAt_idx" ON "FileAccessGrant"("fileId", "revokedAt");
CREATE INDEX "FileAccessGrant_grantedById_createdAt_idx" ON "FileAccessGrant"("grantedById", "createdAt");
