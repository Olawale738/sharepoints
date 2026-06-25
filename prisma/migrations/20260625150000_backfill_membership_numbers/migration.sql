INSERT INTO "MemberProfile" (
  "id",
  "userId",
  "membershipNumber",
  "membershipStatus",
  "digitalIdLocation",
  "createdAt",
  "updatedAt"
)
SELECT
  'member_' || SUBSTRING(MD5(card."userId") FROM 1 FOR 20),
  card."userId",
  card."cardNumber",
  'ACTIVE',
  'LETTW Worldwide',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "DigitalMembershipCard" card
LEFT JOIN "MemberProfile" profile ON profile."userId" = card."userId"
WHERE profile."id" IS NULL
  AND card."deletedAt" IS NULL;

UPDATE "MemberProfile" profile
SET
  "membershipNumber" = card."cardNumber",
  "updatedAt" = CURRENT_TIMESTAMP
FROM "DigitalMembershipCard" card
WHERE profile."userId" = card."userId"
  AND card."deletedAt" IS NULL
  AND (profile."membershipNumber" IS NULL OR BTRIM(profile."membershipNumber") = '');
