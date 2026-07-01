import { createHash, randomUUID } from "node:crypto";

import { MembershipCardStatus, Prisma } from "@prisma/client";

import { activityActions, logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";

const ORG_NAME = "Light Encounter Tabernacle Worldwide";
const ORG_SHORT = "LETTW";

function publicOrigin() {
  return (process.env.AUTH_URL ?? "https://sharepoints.letw.org").replace(/\/$/, "");
}

export function generateCardNumber(year = new Date().getUTCFullYear()) {
  return `LETW-${year}-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`;
}

export function generateOrganizationId() {
  return `LETW.ORG-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`;
}

export function generateMembershipNumber(sequence: number) {
  return `LETW-${new Date().getUTCFullYear()}-${String(sequence).padStart(5, "0")}`;
}

export function cardIsLive(card: {
  status: string;
  expiresAt: Date | null;
  deletedAt?: Date | null;
}) {
  return Boolean(card.status === "ACTIVE" && !card.deletedAt && (!card.expiresAt || card.expiresAt > new Date()));
}

export function cardStatusTone(card: {
  status: string;
  expiresAt: Date | null;
  deletedAt?: Date | null;
}) {
  if (card.deletedAt) return "DELETED";
  if (card.status === "LOST") return "LOST";
  if (card.status === "REVOKED") return "REVOKED";
  if (card.status === "SUSPENDED") return "SUSPENDED";
  if (card.expiresAt && card.expiresAt <= new Date()) return "EXPIRED";
  return "ACTIVE";
}

export function buildOfflineIdentityPayload(input: {
  organizationId: string;
  cardNumber: string;
  name: string;
  membershipNumber: string;
  position: string;
  location: string;
  memberSince: string;
  expiresAt: Date | null;
}) {
  const payload = {
    type: "LETW_OFFLINE_IDENTITY_V1",
    organization: ORG_NAME,
    organizationShortName: ORG_SHORT,
    organizationId: input.organizationId,
    cardNumber: input.cardNumber,
    name: input.name,
    membershipNumber: input.membershipNumber,
    position: input.position,
    location: input.location,
    memberSince: input.memberSince,
    expiresAt: input.expiresAt?.toISOString() ?? null,
    verifyUrl: `${publicOrigin()}/verify/member/${input.organizationId}`
  };
  const hash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  return { payload, hash };
}

export async function ensureMemberNumber(userId: string) {
  const profile = await prisma.memberProfile.findUnique({
    where: { userId },
    select: { membershipNumber: true }
  });
  if (profile?.membershipNumber?.trim()) return profile.membershipNumber;

  const count = await prisma.memberProfile.count({
    where: { membershipNumber: { not: null } }
  });
  let membershipNumber = generateMembershipNumber(count + 1);
  let offset = 1;
  while (await prisma.memberProfile.findUnique({ where: { membershipNumber } })) {
    membershipNumber = generateMembershipNumber(count + 1 + offset);
    offset += 1;
  }

  await prisma.memberProfile.upsert({
    where: { userId },
    update: { membershipNumber },
    create: {
      userId,
      membershipNumber,
      digitalIdLocation: "LETTW Worldwide"
    }
  });
  return membershipNumber;
}

async function accountForOfflinePayload(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      memberProfile: {
        select: {
          membershipNumber: true,
          membershipStartedAt: true,
          organizationPosition: true,
          digitalIdLocation: true
        }
      }
    }
  });
}

export async function refreshOfflinePayload(cardId: string) {
  const card = await prisma.digitalMembershipCard.findUnique({ where: { id: cardId } });
  if (!card) return null;
  const account = await accountForOfflinePayload(card.userId);
  const membershipNumber = account?.memberProfile?.membershipNumber || card.cardNumber;
  const memberSince = String(
    account?.memberProfile?.membershipStartedAt?.getFullYear() ?? card.issuedAt.getUTCFullYear()
  );
  const { payload, hash } = buildOfflineIdentityPayload({
    organizationId: card.organizationId,
    cardNumber: card.cardNumber,
    name: account?.name ?? "LETTW Member",
    membershipNumber,
    position: account?.memberProfile?.organizationPosition ?? "Member",
    location: account?.memberProfile?.digitalIdLocation ?? "LETTW Worldwide",
    memberSince,
    expiresAt: card.expiresAt
  });
  return prisma.digitalMembershipCard.update({
    where: { id: card.id },
    data: {
      offlinePayload: payload as Prisma.InputJsonObject,
      offlinePayloadHash: hash
    }
  });
}

export async function issueOrReissueCard(input: {
  userId: string;
  actorId: string;
  expiresAt?: Date | null;
  preserveCardNumber?: boolean;
}) {
  const issuedAt = new Date();
  const card = await prisma.digitalMembershipCard.upsert({
    where: { userId: input.userId },
    update: {
      status: MembershipCardStatus.ACTIVE,
      qrToken: randomUUID(),
      issuedAt,
      expiresAt: input.expiresAt ?? null,
      revokedAt: null,
      revokedById: null,
      lostAt: null,
      lostById: null,
      renewedAt: null,
      renewedById: null,
      deletedAt: null,
      deletedById: null,
      qrRotatedAt: issuedAt,
      qrRotationCount: { increment: 1 },
      lastStatusReason: null,
      credentialId: null,
      credentialJwt: null,
      credentialKeyId: null,
      credentialFingerprint: null,
      credentialIssuedAt: null,
      issuedById: input.actorId
    },
    create: {
      userId: input.userId,
      qrToken: randomUUID(),
      cardNumber: generateCardNumber(),
      organizationId: generateOrganizationId(),
      issuedAt,
      expiresAt: input.expiresAt ?? null,
      issuedById: input.actorId,
      qrRotatedAt: issuedAt
    }
  });
  const membershipNumber = await ensureMemberNumber(input.userId);
  const refreshed = await refreshOfflinePayload(card.id);
  await logActivity({
    userId: input.actorId,
    action: activityActions.membershipCardReissued,
    targetId: card.id,
    metadata: { userId: input.userId, membershipNumber }
  });
  return refreshed ?? card;
}

export async function renewCard(input: {
  cardId: string;
  actorId: string;
  expiresAt: Date | null;
  rotateQr?: boolean;
}) {
  const card = await prisma.digitalMembershipCard.update({
    where: { id: input.cardId },
    data: {
      status: MembershipCardStatus.ACTIVE,
      expiresAt: input.expiresAt,
      renewedAt: new Date(),
      renewedById: input.actorId,
      revokedAt: null,
      revokedById: null,
      lostAt: null,
      lostById: null,
      lastStatusReason: null,
      ...(input.rotateQr
        ? {
            qrToken: randomUUID(),
            qrRotatedAt: new Date(),
            qrRotationCount: { increment: 1 },
            credentialId: null,
            credentialJwt: null,
            credentialKeyId: null,
            credentialFingerprint: null,
            credentialIssuedAt: null
          }
        : {})
    }
  });
  await refreshOfflinePayload(card.id);
  await logActivity({
    userId: input.actorId,
    action: activityActions.membershipCardRenewed,
    targetId: card.id,
    metadata: { expiresAt: input.expiresAt?.toISOString() ?? null, rotateQr: Boolean(input.rotateQr) }
  });
  return card;
}

export async function markCardLost(input: {
  cardId: string;
  actorId: string;
  reason?: string | null;
}) {
  const card = await prisma.digitalMembershipCard.update({
    where: { id: input.cardId },
    data: {
      status: MembershipCardStatus.LOST,
      lostAt: new Date(),
      lostById: input.actorId,
      revokedAt: new Date(),
      revokedById: input.actorId,
      lastStatusReason: input.reason ?? "Card reported lost.",
      credentialId: null,
      credentialJwt: null,
      credentialKeyId: null,
      credentialFingerprint: null,
      credentialIssuedAt: null
    }
  });
  await logActivity({
    userId: input.actorId,
    action: activityActions.membershipCardMarkedLost,
    targetId: card.id,
    metadata: { reason: input.reason ?? null }
  });
  return card;
}

export async function rotateCardQr(input: {
  cardId: string;
  actorId: string;
  reason?: string | null;
}) {
  const card = await prisma.digitalMembershipCard.update({
    where: { id: input.cardId },
    data: {
      qrToken: randomUUID(),
      qrRotatedAt: new Date(),
      qrRotationCount: { increment: 1 },
      lastStatusReason: input.reason ?? "QR token rotated.",
      credentialId: null,
      credentialJwt: null,
      credentialKeyId: null,
      credentialFingerprint: null,
      credentialIssuedAt: null
    }
  });
  await refreshOfflinePayload(card.id);
  await logActivity({
    userId: input.actorId,
    action: activityActions.membershipCardQrRotated,
    targetId: card.id,
    metadata: { reason: input.reason ?? null }
  });
  return card;
}

export async function logQrBulkAction(input: {
  actorId: string;
  action: string;
  count: number;
  metadata?: Prisma.InputJsonObject;
}) {
  await prisma.qrBulkActionLog.create({
    data: {
      createdById: input.actorId,
      action: input.action,
      count: input.count,
      metadata: input.metadata
    }
  });
  await logActivity({
    userId: input.actorId,
    action: activityActions.qrBulkActionRun,
    metadata: {
      action: input.action,
      count: input.count,
      ...(input.metadata ?? {})
    }
  });
}

export function cardCsvRow(values: Array<string | number | null | undefined>) {
  return values
    .map((value) => {
      const text = String(value ?? "");
      return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    })
    .join(",");
}
