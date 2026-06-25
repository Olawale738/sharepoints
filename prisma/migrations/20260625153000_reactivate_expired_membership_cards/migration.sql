UPDATE "DigitalMembershipCard"
SET
  "expiresAt" = NULL,
  "issuedAt" = CURRENT_TIMESTAMP,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "deletedAt" IS NULL
  AND "status" = 'ACTIVE'
  AND "expiresAt" IS NOT NULL
  AND "expiresAt" <= CURRENT_TIMESTAMP;
