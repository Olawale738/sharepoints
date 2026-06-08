-- AlterTable
ALTER TABLE "User" ADD COLUMN "suspendedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "accessRevokedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "User_suspendedAt_idx" ON "User"("suspendedAt");
CREATE INDEX "User_accessRevokedAt_idx" ON "User"("accessRevokedAt");
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");
