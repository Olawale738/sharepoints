ALTER TABLE "DigitalMembershipCard"
ADD COLUMN "credentialId" TEXT,
ADD COLUMN "credentialJwt" TEXT,
ADD COLUMN "credentialKeyId" TEXT,
ADD COLUMN "credentialFingerprint" TEXT,
ADD COLUMN "credentialIssuedAt" TIMESTAMP(3),
ADD COLUMN "credentialVersion" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "DigitalMembershipCard_credentialId_key"
ON "DigitalMembershipCard"("credentialId");

CREATE INDEX "DigitalMembershipCard_credentialKeyId_idx"
ON "DigitalMembershipCard"("credentialKeyId");

ALTER TABLE "DigitalIdentityVerification"
ADD COLUMN "credentialId" TEXT,
ADD COLUMN "keyId" TEXT,
ADD COLUMN "signatureValid" BOOLEAN,
ADD COLUMN "statusValid" BOOLEAN;

CREATE INDEX "DigitalIdentityVerification_credentialId_createdAt_idx"
ON "DigitalIdentityVerification"("credentialId", "createdAt");

CREATE TABLE "CredentialSigningKey" (
  "id" TEXT NOT NULL,
  "kid" TEXT NOT NULL,
  "algorithm" TEXT NOT NULL DEFAULT 'EdDSA',
  "publicJwk" JSONB NOT NULL,
  "encryptedPrivateJwk" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "retiredAt" TIMESTAMP(3),
  CONSTRAINT "CredentialSigningKey_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CredentialSigningKey_kid_key"
ON "CredentialSigningKey"("kid");

CREATE INDEX "CredentialSigningKey_active_createdAt_idx"
ON "CredentialSigningKey"("active", "createdAt");
