import { createHash } from "node:crypto";

import { AccessDecision, AccessMethod, type AccessRule } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { ensureMembershipCredential, verifyMembershipCredential } from "@/lib/verifiable-credentials";

export function hashAccessSecret(secret: string) {
  return createHash("sha256").update(`letw-access-device:${secret}`).digest("hex");
}

export function hashAccessIp(ip: string) {
  return createHash("sha256")
    .update(`${process.env.AUTH_SECRET ?? "letw-access"}:${ip}`)
    .digest("hex");
}

function currentTimeKey(date = new Date()) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function ruleIsInWindow(rule: AccessRule, now = new Date()) {
  if (rule.validFrom && rule.validFrom > now) return false;
  if (rule.validUntil && rule.validUntil < now) return false;

  if (Array.isArray(rule.weekdays) && rule.weekdays.length) {
    const weekday = now.getDay();
    if (!rule.weekdays.map((item) => Number(item)).includes(weekday)) return false;
  }

  if (rule.timeStart && rule.timeEnd) {
    const current = currentTimeKey(now);
    if (rule.timeStart <= rule.timeEnd) {
      return current >= rule.timeStart && current <= rule.timeEnd;
    }
    return current >= rule.timeStart || current <= rule.timeEnd;
  }

  return true;
}

type AccessAccount = {
  id: string;
  name: string | null;
  email: string | null;
  category: string | null;
  departmentId: string | null;
  suspendedAt: Date | null;
  accessRevokedAt: Date | null;
  deletedAt: Date | null;
  workspaceMemberships: Array<{ role: string; workspaceId: string }>;
  memberProfile: {
    membershipNumber: string | null;
    membershipStatus: string;
    organizationPosition: string | null;
    currentOrganizationUnitId: string | null;
    digitalIdLocation: string;
  } | null;
};

function ruleMatches(rule: AccessRule, account: AccessAccount) {
  if (!ruleIsInWindow(rule)) return false;
  if (rule.subjectType === "ALL_ACTIVE") return true;
  if (rule.subjectType === "USER") return rule.subjectId === account.id;
  if (rule.subjectType === "DEPARTMENT") return Boolean(rule.subjectId && rule.subjectId === account.departmentId);
  if (rule.subjectType === "CATEGORY") return Boolean(rule.subjectId && rule.subjectId === account.category);
  if (rule.subjectType === "ORGANIZATION_UNIT") {
    return Boolean(rule.subjectId && rule.subjectId === account.memberProfile?.currentOrganizationUnitId);
  }
  if (rule.subjectType === "WORKSPACE") {
    return account.workspaceMemberships.some((membership) => membership.workspaceId === rule.subjectId);
  }
  if (rule.subjectType === "ROLE") {
    const expectedRole = (rule.role ?? rule.subjectId ?? "").toUpperCase();
    return account.workspaceMemberships.some((membership) => membership.role.toUpperCase() === expectedRole);
  }
  return false;
}

export type AccessScanInput = {
  accessPointId: string;
  qrToken?: string | null;
  organizationId?: string | null;
  visitorToken?: string | null;
  purpose?: string | null;
  method: AccessMethod;
  scannedById?: string | null;
  deviceId?: string | null;
  ipHash?: string | null;
  userAgent?: string | null;
};

export async function evaluateAccessScan(input: AccessScanInput) {
  const accessPoint = await prisma.accessPoint.findUnique({ where: { id: input.accessPointId } });
  const rules = await prisma.accessRule.findMany({
    where: { accessPointId: input.accessPointId },
    orderBy: [{ priority: "asc" }, { createdAt: "asc" }]
  });

  const purpose = (input.purpose ?? "ACCESS").toUpperCase();
  const visitorPass = input.visitorToken
    ? await prisma.temporaryVisitorPass.findUnique({ where: { qrToken: input.visitorToken } })
    : null;

  let card = input.qrToken
    ? await prisma.digitalMembershipCard.findFirst({ where: { qrToken: input.qrToken, deletedAt: null } })
    : input.organizationId
      ? await prisma.digitalMembershipCard.findFirst({ where: { organizationId: input.organizationId, deletedAt: null } })
      : null;

  const account: AccessAccount | null = card
    ? await prisma.user.findUnique({
        where: { id: card.userId },
        select: {
          id: true,
          name: true,
          email: true,
          category: true,
          departmentId: true,
          suspendedAt: true,
          accessRevokedAt: true,
          deletedAt: true,
          workspaceMemberships: {
            where: { workspace: { deletedAt: null } },
            select: { role: true, workspaceId: true }
          },
          memberProfile: {
            select: {
              membershipNumber: true,
              membershipStatus: true,
              organizationPosition: true,
              currentOrganizationUnitId: true,
              digitalIdLocation: true
            }
          }
        }
      })
    : null;

  let decision: AccessDecision = AccessDecision.DENIED;
  let reason = "Access denied.";
  let credentialValid = false;
  let signatureValid = false;
  let statusValid = false;
  let riskScore = 0;
  let suspicious = false;
  let metadata: Record<string, unknown> = { purpose };

  if (!accessPoint) {
    reason = "Access point not found.";
  } else if (!accessPoint.active) {
    reason = "Access point is inactive.";
  } else if (visitorPass) {
    const now = new Date();
    const validVisitor =
      visitorPass.status === "ACTIVE" &&
      !visitorPass.revokedAt &&
      visitorPass.validFrom <= now &&
      visitorPass.validUntil >= now &&
      (!visitorPass.accessPointId || visitorPass.accessPointId === accessPoint.id);

    if (validVisitor) {
      decision = AccessDecision.GRANTED;
      reason = "Temporary visitor pass granted entry.";
      await prisma.temporaryVisitorPass.update({
        where: { id: visitorPass.id },
        data: { scanCount: { increment: 1 } }
      });
    } else {
      decision = AccessDecision.DENIED;
      reason =
        visitorPass.revokedAt || visitorPass.status !== "ACTIVE"
          ? "Temporary visitor pass is revoked."
          : visitorPass.validUntil < now
            ? "Temporary visitor pass has expired."
            : visitorPass.validFrom > now
              ? "Temporary visitor pass is not valid yet."
              : "Temporary visitor pass is not valid for this access point.";
      riskScore += 40;
    }
    metadata = {
      ...metadata,
      visitorName: visitorPass.displayName,
      visitorPurpose: visitorPass.purpose,
      validUntil: visitorPass.validUntil.toISOString()
    };
  } else if (!card) {
    reason = "Digital ID was not found.";
  } else if (!account) {
    reason = "Member account was not found.";
  } else if (account.suspendedAt || account.accessRevokedAt || account.deletedAt) {
    reason = "Member account is inactive.";
  } else {
    try {
      const issued = await ensureMembershipCredential(card.id);
      card = issued.card;
      const verification = await verifyMembershipCredential(card);
      credentialValid = verification.valid;
      signatureValid = verification.signatureValid;
      statusValid = verification.statusValid;
    } catch {
      reason = "Digital ID verification is temporarily unavailable.";
    }

    if (!signatureValid) riskScore += 40;
    if (!statusValid) riskScore += 30;
    if (accessPoint.highSecurity) riskScore += 10;

    if (card.status === "LOST") {
      reason = "Digital ID was reported lost and cannot be accepted.";
      riskScore += 60;
    } else if (card.status === "REVOKED") {
      reason = "Digital ID has been revoked.";
      riskScore += 60;
    } else if (card.expiresAt && card.expiresAt <= new Date()) {
      reason = "Digital ID has expired.";
      riskScore += 35;
    } else if (accessPoint.requireLiveCard && !credentialValid) {
      reason = signatureValid ? "Digital ID is not active." : "Digital ID signature could not be verified.";
    } else if (accessPoint.workspaceId && !account.workspaceMemberships.some((membership) => membership.workspaceId === accessPoint.workspaceId)) {
      const isGlobalAdmin = account.workspaceMemberships.some((membership) => membership.role === "ADMIN");
      if (!isGlobalAdmin) {
        reason = "Member is not assigned to this workspace-controlled access point.";
      }
    } else {
      const matches = rules.filter((rule) => ruleMatches(rule, account));
      const denyRule = matches.find((rule) => !rule.canAccess);
      const allowRule = matches.find((rule) => rule.canAccess);
      const isGlobalAdmin = account.workspaceMemberships.some((membership) => membership.role === "ADMIN");
      const highSecurityApproval = accessPoint.highSecurity || accessPoint.requireExplicitApproval
        ? await prisma.digitalIdAccessApproval.findFirst({
            where: {
              accessPointId: accessPoint.id,
              userId: account.id,
              revokedAt: null,
              validFrom: { lte: new Date() },
              OR: [{ validUntil: null }, { validUntil: { gte: new Date() } }]
            }
          })
        : null;

      if (denyRule) {
        decision = AccessDecision.DENIED;
        reason = "A matching access rule denied this member.";
      } else if ((accessPoint.highSecurity || accessPoint.requireExplicitApproval) && !highSecurityApproval) {
        decision = AccessDecision.NEEDS_REVIEW;
        reason = "High-security access requires explicit admin approval before entry.";
      } else if (allowRule || isGlobalAdmin) {
        decision = AccessDecision.GRANTED;
        reason = accessPoint.requirePhotoMatch
          ? "Access rule granted entry. Photo match must be checked by the scanner operator."
          : allowRule
            ? "A matching access rule granted entry."
            : "Global administrator access granted.";
      } else {
        decision = AccessDecision.DENIED;
        reason = "No matching access rule granted entry.";
      }
      metadata = {
        ...metadata,
        highSecurity: accessPoint.highSecurity,
        explicitApproval: Boolean(highSecurityApproval),
        photoMatchRequired: accessPoint.requirePhotoMatch,
        allowRuleId: allowRule?.id ?? null,
        denyRuleId: denyRule?.id ?? null
      };
    }
  }

  if (accessPoint) {
    const recentDenied = card
      ? await prisma.accessScanLog.count({
          where: {
            OR: [{ cardId: card.id }, { organizationId: card.organizationId }],
            decision: AccessDecision.DENIED,
            createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) }
          }
        })
      : visitorPass
        ? await prisma.accessScanLog.count({
            where: {
              visitorPassId: visitorPass.id,
              decision: AccessDecision.DENIED,
              createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) }
            }
          })
        : 0;
    if (recentDenied >= 3) riskScore += 30;
    suspicious = riskScore >= 50 || recentDenied >= 5;

    await prisma.accessScanLog.create({
      data: {
        accessPointId: accessPoint.id,
        cardId: card?.id ?? null,
        visitorPassId: visitorPass?.id ?? null,
        organizationId: card?.organizationId ?? input.organizationId ?? null,
        scannedUserId: card?.userId ?? null,
        method: input.method,
        purpose,
        decision,
        reason,
        riskScore,
        suspicious,
        photoMatchRequired: Boolean(accessPoint.requirePhotoMatch),
        scannedById: input.scannedById ?? null,
        deviceId: input.deviceId ?? null,
        ipHash: input.ipHash ?? null,
        userAgent: input.userAgent?.slice(0, 500) ?? null,
        metadata: metadata as never
      }
    });
  }

  return {
    decision,
    granted: decision === AccessDecision.GRANTED,
    reason,
    accessPoint,
    member: account && card
      ? {
          id: account.id,
          name: account.name,
          email: account.email,
          organizationId: card.organizationId,
          membershipNumber: account.memberProfile?.membershipNumber || card.cardNumber,
          membershipStatus: account.memberProfile?.membershipStatus ?? "ACTIVE",
          position: account.memberProfile?.organizationPosition ?? "Member",
          location: account.memberProfile?.digitalIdLocation ?? "LETTW Worldwide"
        }
      : null,
    visitor: visitorPass
      ? {
          id: visitorPass.id,
          name: visitorPass.displayName,
          purpose: visitorPass.purpose,
          validUntil: visitorPass.validUntil
        }
      : null,
    verification: {
      credentialValid,
      signatureValid,
      statusValid
    },
    security: {
      riskScore,
      suspicious,
      photoMatchRequired: Boolean(accessPoint?.requirePhotoMatch)
    }
  };
}
