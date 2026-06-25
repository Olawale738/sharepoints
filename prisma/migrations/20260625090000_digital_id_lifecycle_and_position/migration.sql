ALTER TABLE "MemberProfile"
ADD COLUMN "organizationPosition" TEXT,
ADD COLUMN "digitalIdLocation" TEXT NOT NULL DEFAULT 'LETTW Worldwide';

ALTER TABLE "DigitalMembershipCard"
ADD COLUMN "revokedById" TEXT,
ADD COLUMN "deletedAt" TIMESTAMP(3),
ADD COLUMN "deletedById" TEXT;

CREATE INDEX "DigitalMembershipCard_status_deletedAt_idx"
ON "DigitalMembershipCard"("status", "deletedAt");
