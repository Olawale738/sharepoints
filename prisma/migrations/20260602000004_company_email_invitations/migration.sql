CREATE TABLE "CompanyEmailInvitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "invitedById" TEXT,
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyEmailInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyEmailInvitation_email_key" ON "CompanyEmailInvitation"("email");
CREATE INDEX "CompanyEmailInvitation_email_revokedAt_idx" ON "CompanyEmailInvitation"("email", "revokedAt");
CREATE INDEX "CompanyEmailInvitation_invitedById_createdAt_idx" ON "CompanyEmailInvitation"("invitedById", "createdAt");
CREATE INDEX "CompanyEmailInvitation_acceptedById_acceptedAt_idx" ON "CompanyEmailInvitation"("acceptedById", "acceptedAt");

ALTER TABLE "CompanyEmailInvitation" ADD CONSTRAINT "CompanyEmailInvitation_invitedById_fkey"
FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CompanyEmailInvitation" ADD CONSTRAINT "CompanyEmailInvitation_acceptedById_fkey"
FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "CompanyEmailInvitation" (
  "id",
  "email",
  "invitedById",
  "acceptedById",
  "acceptedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  'company-invite-admin-letw-org',
  'admin@letw.org',
  "id",
  "id",
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User"
WHERE "email" = 'admin@letw.org'
ON CONFLICT ("email") DO UPDATE SET
  "acceptedById" = EXCLUDED."acceptedById",
  "acceptedAt" = COALESCE("CompanyEmailInvitation"."acceptedAt", CURRENT_TIMESTAMP),
  "revokedAt" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP;
