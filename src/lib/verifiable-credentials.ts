import {
  createCipheriv,
  createDecipheriv,
  createHash,
  generateKeyPairSync,
  randomBytes,
  randomUUID
} from "node:crypto";

import type { DigitalMembershipCard, Prisma } from "@prisma/client";
import { decodeProtectedHeader, importJWK, jwtVerify, SignJWT, type JWK, type JWTPayload } from "jose";

import { prisma } from "@/lib/prisma";

const ISSUER = "https://letw.org";
const VERIFIER_ORIGIN = "https://sharepoints.letw.org";
const CONTEXT = "https://www.w3.org/ns/credentials/v2";
const CREDENTIAL_TYPE = "LETWOrganizationMembershipCredential";

type CredentialAccount = {
  id: string;
  name: string | null;
  image: string | null;
  suspendedAt: Date | null;
  accessRevokedAt: Date | null;
  deletedAt: Date | null;
  memberProfile: {
    membershipNumber: string | null;
    membershipStatus: string;
    membershipStartedAt: Date | null;
    organizationPosition: string | null;
    digitalIdLocation: string;
  } | null;
};

export type CredentialVerification = {
  signatureValid: boolean;
  statusValid: boolean;
  valid: boolean;
  keyId: string | null;
  credentialId: string | null;
  payload: JWTPayload | null;
  reason: string | null;
};

function encryptionKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required for credential signing.");
  return createHash("sha256").update(`letw-verifiable-credentials:${secret}`).digest();
}

function encryptPrivateJwk(jwk: JWK) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(jwk), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((value) => value.toString("base64url")).join(".");
}

function decryptPrivateJwk(value: string) {
  const [ivEncoded, tagEncoded, encryptedEncoded] = value.split(".");
  if (!ivEncoded || !tagEncoded || !encryptedEncoded) {
    throw new Error("Credential signing key is malformed.");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivEncoded, "base64url"));
  decipher.setAuthTag(Buffer.from(tagEncoded, "base64url"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedEncoded, "base64url")),
    decipher.final()
  ]);
  return JSON.parse(decrypted.toString("utf8")) as JWK;
}

async function activeSigningKey() {
  const existing = await prisma.credentialSigningKey.findFirst({
    where: { active: true },
    orderBy: { createdAt: "desc" }
  });
  if (existing) return existing;

  return createSigningKey();
}

async function createSigningKey() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateJwk = privateKey.export({ format: "jwk" }) as JWK;
  const publicJwk = publicKey.export({ format: "jwk" }) as JWK;
  const kid = `letw-ed25519-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;

  return prisma.credentialSigningKey.create({
    data: {
      kid,
      algorithm: "EdDSA",
      publicJwk: { ...publicJwk, kid, alg: "EdDSA", use: "sig" } as Prisma.InputJsonObject,
      encryptedPrivateJwk: encryptPrivateJwk(privateJwk)
    }
  });
}

async function importSigningPrivateKey() {
  let key = await activeSigningKey();

  try {
    return {
      key,
      privateKey: await importJWK(decryptPrivateJwk(key.encryptedPrivateJwk), "EdDSA")
    };
  } catch {
    await prisma.credentialSigningKey
      .update({
        where: { id: key.id },
        data: { active: false, retiredAt: new Date() }
      })
      .catch(() => null);
    key = await createSigningKey();

    return {
      key,
      privateKey: await importJWK(decryptPrivateJwk(key.encryptedPrivateJwk), "EdDSA")
    };
  }
}

export async function rotateMembershipCredentialSigningKey() {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateJwk = privateKey.export({ format: "jwk" }) as JWK;
  const publicJwk = publicKey.export({ format: "jwk" }) as JWK;
  const kid = `letw-ed25519-${new Date().toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    await tx.credentialSigningKey.updateMany({
      where: { active: true },
      data: { active: false, retiredAt: now }
    });
    return tx.credentialSigningKey.create({
      data: {
        kid,
        algorithm: "EdDSA",
        publicJwk: { ...publicJwk, kid, alg: "EdDSA", use: "sig" } as Prisma.InputJsonObject,
        encryptedPrivateJwk: encryptPrivateJwk(privateJwk)
      },
      select: {
        id: true,
        kid: true,
        algorithm: true,
        active: true,
        createdAt: true
      }
    });
  });
}

async function credentialAccount(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      image: true,
      suspendedAt: true,
      accessRevokedAt: true,
      deletedAt: true,
      memberProfile: {
        select: {
          membershipNumber: true,
          membershipStatus: true,
          membershipStartedAt: true,
          organizationPosition: true,
          digitalIdLocation: true
        }
      }
    }
  });
}

function signedClaims(card: DigitalMembershipCard, account: CredentialAccount) {
  return {
    name: account.name ?? "LETTW Member",
    membershipNumber: account.memberProfile?.membershipNumber || card.cardNumber,
    organizationId: card.organizationId,
    position: account.memberProfile?.organizationPosition ?? "Member",
    location: account.memberProfile?.digitalIdLocation ?? "LETTW Worldwide",
    membershipStatus: account.memberProfile?.membershipStatus ?? "ACTIVE",
    memberSince: (account.memberProfile?.membershipStartedAt ?? card.issuedAt).toISOString(),
    cardStatus: card.status,
    cardIssuedAt: card.issuedAt.toISOString(),
    cardExpiresAt: card.expiresAt?.toISOString() ?? null
  };
}

function fingerprint(claims: ReturnType<typeof signedClaims>) {
  return createHash("sha256").update(JSON.stringify(claims)).digest("hex");
}

function liveStatus(card: DigitalMembershipCard, account: CredentialAccount | null) {
  return Boolean(
    account &&
      card.deletedAt === null &&
      card.status === "ACTIVE" &&
      (!card.expiresAt || card.expiresAt > new Date()) &&
      !account.suspendedAt &&
      !account.accessRevokedAt &&
      !account.deletedAt
  );
}

export async function ensureMembershipCredential(cardId: string) {
  const card = await prisma.digitalMembershipCard.findUnique({ where: { id: cardId } });
  if (!card || card.deletedAt) throw new Error("Digital membership card not found.");
  const account = await credentialAccount(card.userId);
  if (!account) throw new Error("Credential subject not found.");
  const claims = signedClaims(card, account);
  const currentFingerprint = fingerprint(claims);

  if (
    card.credentialJwt &&
    card.credentialId &&
    card.credentialKeyId &&
    card.credentialFingerprint === currentFingerprint
  ) {
    return { card, account, credential: card.credentialJwt };
  }

  const { key, privateKey } = await importSigningPrivateKey();
  const credentialId = randomUUID();
  const issuedAt = new Date();
  const subjectId = `urn:letw:member:${card.organizationId}`;
  const credentialStatus = `${VERIFIER_ORIGIN}/api/credentials/status/${credentialId}`;
  const vc = {
    "@context": [CONTEXT],
    type: ["VerifiableCredential", CREDENTIAL_TYPE],
    issuer: {
      id: ISSUER,
      name: "Light Encounter Tabernacle Worldwide"
    },
    validFrom: issuedAt.toISOString(),
    ...(card.expiresAt ? { validUntil: card.expiresAt.toISOString() } : {}),
    credentialSubject: {
      id: subjectId,
      ...claims
    },
    credentialStatus: {
      id: credentialStatus,
      type: "LETWCredentialStatus2026"
    }
  };

  const credential = await new SignJWT({ vc })
    .setProtectedHeader({
      alg: "EdDSA",
      kid: key.kid,
      typ: "vc+jwt"
    })
    .setIssuer(ISSUER)
    .setSubject(subjectId)
    .setJti(credentialId)
    .setIssuedAt(Math.floor(issuedAt.getTime() / 1000))
    .setNotBefore(Math.floor(issuedAt.getTime() / 1000))
    .setExpirationTime(
      Math.floor((card.expiresAt ?? new Date("2099-12-31T23:59:59.000Z")).getTime() / 1000)
    )
    .sign(privateKey);

  const updatedCard = await prisma.digitalMembershipCard.update({
    where: { id: card.id },
    data: {
      credentialId,
      credentialJwt: credential,
      credentialKeyId: key.kid,
      credentialFingerprint: currentFingerprint,
      credentialIssuedAt: issuedAt,
      credentialVersion: { increment: 1 }
    }
  });

  return { card: updatedCard, account, credential };
}

export async function verifyMembershipCredential(card: DigitalMembershipCard) {
  if (!card.credentialJwt) {
    return {
      signatureValid: false,
      statusValid: false,
      valid: false,
      keyId: null,
      credentialId: null,
      payload: null,
      reason: "Credential has not been signed."
    } satisfies CredentialVerification;
  }

  let keyId: string | null = null;
  let credentialId: string | null = null;
  let payload: JWTPayload | null = null;
  let signatureValid = false;
  let reason: string | null = null;
  const account = await credentialAccount(card.userId);

  try {
    const header = decodeProtectedHeader(card.credentialJwt);
    keyId = typeof header.kid === "string" ? header.kid : null;
    if (!keyId) throw new Error("Credential key ID is missing.");
    const key = await prisma.credentialSigningKey.findUnique({ where: { kid: keyId } });
    if (!key) throw new Error("Credential signing key is unknown.");
    const publicKey = await importJWK(key.publicJwk as JWK, "EdDSA");
    const result = await jwtVerify(card.credentialJwt, publicKey, {
      issuer: ISSUER,
      algorithms: ["EdDSA"]
    });
    payload = result.payload;
    credentialId = typeof result.payload.jti === "string" ? result.payload.jti : null;
    const expectedSubject = `urn:letw:member:${card.organizationId}`;
    const vc =
      result.payload.vc && typeof result.payload.vc === "object"
        ? (result.payload.vc as Record<string, unknown>)
        : null;
    const credentialSubject =
      vc?.credentialSubject && typeof vc.credentialSubject === "object"
        ? (vc.credentialSubject as Record<string, unknown>)
        : null;
    if (!credentialId || credentialId !== card.credentialId) {
      throw new Error("Credential identifier does not match the active record.");
    }
    if (keyId !== card.credentialKeyId) {
      throw new Error("Credential signing key does not match the active record.");
    }
    if (
      result.payload.sub !== expectedSubject ||
      credentialSubject?.id !== expectedSubject ||
      credentialSubject.organizationId !== card.organizationId ||
      credentialSubject.membershipNumber !==
        (account?.memberProfile?.membershipNumber || card.cardNumber)
    ) {
      throw new Error("Signed credential claims do not match the active member record.");
    }
    signatureValid = true;
  } catch (error) {
    reason = error instanceof Error ? error.message : "Credential signature verification failed.";
  }

  const statusValid = liveStatus(card, account);
  return {
    signatureValid,
    statusValid,
    valid: signatureValid && statusValid,
    keyId,
    credentialId,
    payload,
    reason
  } satisfies CredentialVerification;
}

export async function membershipCredentialStatus(credentialId: string) {
  const card = await prisma.digitalMembershipCard.findUnique({ where: { credentialId } });
  if (!card) {
    return {
      credentialId,
      valid: false,
      status: "SUPERSEDED_OR_UNKNOWN"
    };
  }
  const account = await credentialAccount(card.userId);
  const valid = liveStatus(card, account);
  const status = valid
    ? "ACTIVE"
    : card.deletedAt
      ? "DELETED"
      : card.status !== "ACTIVE"
        ? card.status
        : card.expiresAt && card.expiresAt <= new Date()
          ? "EXPIRED"
          : "ACCOUNT_INACTIVE";
  return {
    credentialId,
    valid,
    status,
    checkedAt: new Date().toISOString()
  };
}

export async function publicCredentialJwks() {
  const keys = await prisma.credentialSigningKey.findMany({
    orderBy: { createdAt: "desc" },
    select: { publicJwk: true }
  });
  return {
    issuer: ISSUER,
    jwks_uri: `${VERIFIER_ORIGIN}/api/credentials/jwks`,
    keys: keys.map((key) => key.publicJwk)
  };
}
