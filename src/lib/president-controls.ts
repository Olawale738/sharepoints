import { randomBytes, randomUUID } from "node:crypto";

import { ApprovalStatus, OfficialLetterStatus, OfficialLetterType, PresidentialApprovalTargetType, Prisma, WorkspaceRole } from "@prisma/client";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError } from "@/lib/api";
import { certificateCredentialHash, generateCertificateNumber, generateSealNumber, signCertificate } from "@/lib/certificate-security";
import { normalizeCertificateExpiry } from "@/lib/certificates";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { issueOrReissueCard, markCardLost, renewCard, rotateCardQr } from "@/lib/qr-identity";

const GLOBAL_SCOPE = "GLOBAL";

export type LockdownAction =
  | "LOGIN"
  | "DOWNLOAD"
  | "DOCUMENT_CHANGE"
  | "OFFICIAL_ISSUING"
  | "WORKSPACE_ACTION"
  | "FINANCIAL_ACTION";

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function presidentEmails() {
  return Array.from(
    new Set(
      [process.env.PRESIDENT_ADMIN_EMAIL, process.env.SEED_ADMIN_EMAIL ?? "president@letw.org"]
        .filter(Boolean)
        .map((email) => normalizeEmail(String(email)))
    )
  );
}

function letterNumber(type: string) {
  const prefix = type
    .split("_")
    .map((part) => part[0])
    .join("");
  return `LETW-${prefix}-${new Date().getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function receiptNumber() {
  return `LETW-GIVE-${new Date().getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function payloadText(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function payloadDate(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" && value ? new Date(value) : null;
}

export async function isPresidentAuthority(userId?: string | null) {
  if (!userId) return false;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return Boolean(user?.email && presidentEmails().includes(normalizeEmail(user.email)));
}

async function presidentUserIds() {
  const users = await prisma.user.findMany({
    where: { email: { in: presidentEmails() }, deletedAt: null, suspendedAt: null, accessRevokedAt: null },
    select: { id: true }
  });
  return users.map((user) => user.id);
}

export async function getApprovalWallPolicy() {
  return prisma.presidentApprovalWallPolicy.upsert({
    where: { scope: GLOBAL_SCOPE },
    update: {},
    create: { scope: GLOBAL_SCOPE }
  });
}

export async function getEmergencyLockdownState() {
  return prisma.presidentEmergencyLockdown.upsert({
    where: { scope: GLOBAL_SCOPE },
    update: {},
    create: { scope: GLOBAL_SCOPE }
  });
}

export async function assertEmergencyLockdownAllows(action: LockdownAction, actorId?: string | null) {
  if (actorId && (await isPresidentAuthority(actorId))) return;
  const state = await getEmergencyLockdownState();
  if (!state.active) return;

  const blocked =
    (action === "LOGIN" && state.lockNewLogins) ||
    (action === "DOWNLOAD" && state.lockDownloads) ||
    (action === "DOCUMENT_CHANGE" && state.freezeDocumentChanges) ||
    (action === "OFFICIAL_ISSUING" && state.disableOfficialIssuing) ||
    (action === "WORKSPACE_ACTION" && state.lockWorkspaceActions) ||
    (action === "FINANCIAL_ACTION" && state.lockFinancialActions);

  if (blocked) {
    throw new ApiError(423, state.reason || "LETW emergency lockdown is active for this action.");
  }
}

export async function updateApprovalWallPolicy(actorId: string, input: Partial<{
  active: boolean;
  requireOfficialLetters: boolean;
  requireCertificates: boolean;
  requireIdCards: boolean;
  requireLeadershipAppointments: boolean;
  requireSensitiveFiles: boolean;
  requireFinancialApprovals: boolean;
}>) {
  if (!(await isPresidentAuthority(actorId))) {
    throw new ApiError(403, "Only the LETW president can change the President Approval Wall.");
  }
  const policy = await prisma.presidentApprovalWallPolicy.upsert({
    where: { scope: GLOBAL_SCOPE },
    create: { scope: GLOBAL_SCOPE, ...input, updatedById: actorId },
    update: { ...input, updatedById: actorId }
  });
  await logActivity({
    userId: actorId,
    action: activityActions.presidentApprovalWallUpdated,
    targetId: policy.id,
    metadata: input as Prisma.InputJsonObject
  });
  return policy;
}

export async function updateEmergencyLockdown(actorId: string, input: Partial<{
  active: boolean;
  lockDownloads: boolean;
  lockNewLogins: boolean;
  freezeDocumentChanges: boolean;
  disableOfficialIssuing: boolean;
  lockWorkspaceActions: boolean;
  lockFinancialActions: boolean;
  reason: string | null;
}>) {
  if (!(await isPresidentAuthority(actorId))) {
    throw new ApiError(403, "Only the LETW president can change emergency lockdown.");
  }
  const activeChanged = typeof input.active === "boolean";
  const now = new Date();
  const state = await prisma.presidentEmergencyLockdown.upsert({
    where: { scope: GLOBAL_SCOPE },
    create: {
      scope: GLOBAL_SCOPE,
      ...input,
      activatedById: input.active ? actorId : null,
      activatedAt: input.active ? now : null,
      deactivatedById: input.active === false ? actorId : null,
      deactivatedAt: input.active === false ? now : null
    },
    update: {
      ...input,
      activatedById: input.active === true ? actorId : undefined,
      activatedAt: input.active === true ? now : undefined,
      deactivatedById: input.active === false ? actorId : undefined,
      deactivatedAt: input.active === false ? now : undefined,
      ...(activeChanged && input.active ? { deactivatedById: null, deactivatedAt: null } : {})
    }
  });
  await logActivity({
    userId: actorId,
    action: activityActions.presidentEmergencyLockdownUpdated,
    targetId: state.id,
    metadata: input as Prisma.InputJsonObject
  });
  return state;
}

export async function updateWorkspaceLock(actorId: string, workspaceId: string, locked: boolean, reason?: string | null) {
  if (!(await isPresidentAuthority(actorId))) {
    throw new ApiError(403, "Only the LETW president can lock or unlock a workspace.");
  }
  const workspace = await prisma.workspace.findFirst({
    where: { id: workspaceId, deletedAt: null },
    select: { id: true, name: true }
  });
  if (!workspace) throw new ApiError(404, "Workspace not found.");

  const updated = await prisma.workspace.update({
    where: { id: workspaceId },
    data: locked
      ? { lockedAt: new Date(), lockedById: actorId, lockReason: reason || "Locked by the LETW president." }
      : { lockedAt: null, lockedById: null, lockReason: null }
  });

  await logActivity({
    userId: actorId,
    workspaceId,
    action: activityActions.presidentEmergencyLockdownUpdated,
    targetId: workspaceId,
    metadata: { scope: "WORKSPACE", locked, workspace: workspace.name, reason: reason ?? null }
  });

  return updated;
}

export async function approvalWallRequires(targetType: PresidentialApprovalTargetType, actorId: string) {
  if (await isPresidentAuthority(actorId)) return false;
  const policy = await getApprovalWallPolicy();
  if (!policy.active) return false;

  if (targetType === PresidentialApprovalTargetType.OFFICIAL_LETTER) return policy.requireOfficialLetters;
  if (targetType === PresidentialApprovalTargetType.CERTIFICATE) return policy.requireCertificates;
  if (targetType === PresidentialApprovalTargetType.ID_CARD) return policy.requireIdCards;
  if (targetType === PresidentialApprovalTargetType.LEADERSHIP_APPOINTMENT) return policy.requireLeadershipAppointments;
  if (targetType === PresidentialApprovalTargetType.SENSITIVE_FILE) return policy.requireSensitiveFiles;
  if (targetType === PresidentialApprovalTargetType.FINANCIAL_APPROVAL) return policy.requireFinancialApprovals;
  return false;
}

export async function queuePresidentialApproval(input: {
  requesterId: string;
  targetType: PresidentialApprovalTargetType;
  targetId?: string | null;
  workspaceId?: string | null;
  organizationUnitId?: string | null;
  title: string;
  summary: string;
  payload?: Prisma.InputJsonValue | null;
}) {
  const item = await prisma.presidentialApprovalItem.create({
    data: {
      requesterId: input.requesterId,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      workspaceId: input.workspaceId ?? null,
      organizationUnitId: input.organizationUnitId ?? null,
      title: input.title,
      summary: input.summary,
      payload: input.payload ?? Prisma.JsonNull
    }
  });
  await logActivity({
    userId: input.requesterId,
    workspaceId: input.workspaceId ?? undefined,
    action: activityActions.presidentApprovalRequested,
    targetId: item.id,
    metadata: { targetType: item.targetType, title: item.title }
  });
  const presidents = await presidentUserIds();
  if (presidents.length) {
    await notifyUsers(presidents, {
      workspaceId: input.workspaceId ?? undefined,
      type: "APPROVAL_REQUIRED",
      title: "President approval required",
      body: input.title,
      href: "/dashboard/admin/president-wall"
    }).catch(() => null);
  }
  return item;
}

export async function maybeQueuePresidentialApproval(input: Parameters<typeof queuePresidentialApproval>[0]) {
  if (!(await approvalWallRequires(input.targetType, input.requesterId))) return null;
  return queuePresidentialApproval(input);
}

function payloadObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

async function applyApprovedItem(item: Awaited<ReturnType<typeof prisma.presidentialApprovalItem.findUnique>>) {
  if (!item) throw new ApiError(404, "President approval item not found.");
  const payload = payloadObject(item.payload);

  if (item.targetType === PresidentialApprovalTargetType.SENSITIVE_FILE) {
    if (!item.targetId) throw new ApiError(422, "Sensitive file approval has no target file.");
    await prisma.file.update({
      where: { id: item.targetId },
      data: { approvalStatus: ApprovalStatus.APPROVED, approvedById: item.reviewerId, approvedAt: new Date(), rejectedReason: null }
    });
    return;
  }

  if (item.targetType === PresidentialApprovalTargetType.CERTIFICATE) {
    if (payload.action === "UPDATE_STATUS" && typeof item.targetId === "string" && typeof payload.status === "string") {
      await prisma.memberCertificationBadge.update({
        where: { id: item.targetId },
        data:
          payload.status === "REVOKED"
            ? { status: "REVOKED", revokedAt: new Date() }
            : { status: "ACTIVE", revokedAt: null }
      });
      return;
    }
    if (payload.action === "DELETE" && typeof item.targetId === "string") {
      await prisma.memberCertificationBadge.delete({ where: { id: item.targetId } });
      return;
    }
    const userId = payloadText(payload, "userId");
    const title = String(payload.title ?? "Membership Certificate");
    const category = payloadText(payload, "certificateCategory") ?? "MINISTRY";
    const issuedAt = new Date();
    const certificate = await prisma.memberCertificationBadge.create({
      data: {
        userId,
        title,
        issuer: String(payload.issuer ?? "Light Encounter Tabernacle Worldwide"),
        certificateCategory: category,
        recipientName: payloadText(payload, "recipientName"),
        recipientEmail: payloadText(payload, "recipientEmail"),
        recipientPhone: payloadText(payload, "recipientPhone"),
        recipientPhotoUrl: payloadText(payload, "recipientPhotoUrl"),
        recipientOrganization: payloadText(payload, "recipientOrganization"),
        educationLevel: payloadText(payload, "educationLevel"),
        programName: payloadText(payload, "programName"),
        fieldOfStudy: payloadText(payload, "fieldOfStudy"),
        gradeOrHonors: payloadText(payload, "gradeOrHonors"),
        studyMode: payloadText(payload, "studyMode"),
        studyStartDate: payloadDate(payload, "studyStartDate"),
        studyEndDate: payloadDate(payload, "studyEndDate"),
        completionDate: payloadDate(payload, "completionDate"),
        customBody: payloadText(payload, "customBody"),
        certificateNumber:
          typeof payload.certificateNumber === "string" && payload.certificateNumber ? payload.certificateNumber : generateCertificateNumber(category),
        sealNumber: generateSealNumber(category),
        verifyToken: randomUUID(),
        issuedAt,
        expiresAt: normalizeCertificateExpiry(typeof payload.expiresAt === "string" ? payload.expiresAt : null),
        createdById: item.requesterId
      }
    });
    await prisma.memberCertificationBadge.update({
      where: { id: certificate.id },
      data: {
        digitalSignature: signCertificate(certificate),
        credentialHash: certificateCredentialHash(certificate)
      }
    });
    return;
  }

  if (item.targetType === PresidentialApprovalTargetType.ID_CARD) {
    const action = String(payload.action ?? "BULK_ISSUE_IDS");
    if (action === "BULK_ISSUE_IDS" || action === "BULK_REISSUE_IDS") {
      const userIds = Array.isArray(payload.userIds) ? payload.userIds.map(String) : [];
      for (const userId of userIds) {
        await issueOrReissueCard({
          userId,
          actorId: item.requesterId,
          expiresAt: typeof payload.expiresAt === "string" ? new Date(payload.expiresAt) : null
        });
      }
      return;
    }
    if (typeof payload.cardId !== "string") throw new ApiError(422, "ID card request is missing the card.");
    if (action === "MARK_LOST") await markCardLost({ cardId: payload.cardId, actorId: item.requesterId, reason: String(payload.reason ?? "President approved") });
    if (action === "RENEW_CARD") {
      await renewCard({
        cardId: payload.cardId,
        actorId: item.requesterId,
        expiresAt: typeof payload.expiresAt === "string" ? new Date(payload.expiresAt) : null,
        rotateQr: Boolean(payload.rotateQr)
      });
    }
    if (action === "ROTATE_QR") await rotateCardQr({ cardId: payload.cardId, actorId: item.requesterId, reason: String(payload.reason ?? "President approved") });
    return;
  }

  if (item.targetType === PresidentialApprovalTargetType.OFFICIAL_LETTER) {
    if (payload.action === "UPDATE_STATUS" && typeof payload.id === "string" && typeof payload.status === "string") {
      await prisma.officialLetter.update({
        where: { id: payload.id },
        data: {
          status: payload.status as OfficialLetterStatus,
          issuedAt: payload.status === "ISSUED" ? new Date() : undefined,
          revokedAt: payload.status === "REVOKED" ? new Date() : null
        }
      });
      return;
    }
    if (payload.action === "DELETE" && typeof payload.id === "string") {
      await prisma.officialLetter.delete({ where: { id: payload.id } });
      return;
    }
    const letterType = String(payload.letterType ?? "APPOINTMENT");
    await prisma.officialLetter.create({
      data: {
        letterType: letterType as OfficialLetterType,
        letterNumber: letterNumber(letterType),
        title: String(payload.title ?? item.title),
        recipientName: String(payload.recipientName ?? "LETW recipient"),
        recipientEmail: typeof payload.recipientEmail === "string" ? payload.recipientEmail : null,
        recipientUserId: typeof payload.recipientUserId === "string" ? payload.recipientUserId : null,
        body: String(payload.body ?? item.summary),
        signatureName: String(payload.signatureName ?? "Olawale N Sanni"),
        workspaceId: typeof payload.workspaceId === "string" ? payload.workspaceId : null,
        organizationUnitId: typeof payload.organizationUnitId === "string" ? payload.organizationUnitId : null,
        status: payload.issueNow === false ? "DRAFT" : "ISSUED",
        issuedAt: payload.issueNow === false ? null : new Date(),
        issuedById: item.requesterId
      }
    });
    return;
  }

  if (item.targetType === PresidentialApprovalTargetType.FINANCIAL_APPROVAL) {
    await prisma.givingReceipt.create({
      data: {
        userId: typeof payload.userId === "string" ? payload.userId : null,
        donorName: String(payload.donorName ?? "LETW donor"),
        donorEmail: typeof payload.donorEmail === "string" ? payload.donorEmail.toLowerCase() : null,
        donorPhone: typeof payload.donorPhone === "string" ? payload.donorPhone : null,
        amountCents: Number(payload.amountCents ?? 0),
        currency: String(payload.currency ?? "GBP").toUpperCase(),
        fund: String(payload.fund ?? "General"),
        paymentMethod: typeof payload.paymentMethod === "string" ? payload.paymentMethod : null,
        receivedAt: typeof payload.receivedAt === "string" ? new Date(payload.receivedAt) : new Date(),
        receiptNumber: receiptNumber(),
        qrToken: randomBytes(24).toString("hex"),
        notes: typeof payload.notes === "string" ? payload.notes : null,
        issuedById: item.requesterId
      }
    });
    return;
  }

  if (item.targetType === PresidentialApprovalTargetType.LEADERSHIP_APPOINTMENT) {
    if (typeof payload.memberId === "string" && typeof payload.role === "string") {
      await prisma.workspaceMember.update({ where: { id: payload.memberId }, data: { role: payload.role as WorkspaceRole } });
      return;
    }
    if (typeof payload.unitId === "string" && typeof payload.userId === "string" && typeof payload.title === "string") {
      await prisma.organizationUnitLeader.upsert({
        where: {
          unitId_userId_title: {
            unitId: payload.unitId,
            userId: payload.userId,
            title: payload.title
          }
        },
        update: {
          canCreateWorkspaces: Boolean(payload.canCreateWorkspaces),
          inheritToChildren: Boolean(payload.inheritToChildren),
          assignedById: item.requesterId
        },
        create: {
          unitId: payload.unitId,
          userId: payload.userId,
          title: payload.title,
          canCreateWorkspaces: Boolean(payload.canCreateWorkspaces),
          inheritToChildren: Boolean(payload.inheritToChildren),
          assignedById: item.requesterId
        }
      });
    }
  }
}

export async function reviewPresidentialApprovalItem(actorId: string, id: string, status: ApprovalStatus, reason?: string | null) {
  if (!(await isPresidentAuthority(actorId))) {
    throw new ApiError(403, "Only the LETW president can review President Approval Wall requests.");
  }
  const item = await prisma.presidentialApprovalItem.findUnique({ where: { id } });
  if (!item) throw new ApiError(404, "President approval item not found.");
  if (item.status !== ApprovalStatus.PENDING) throw new ApiError(409, "This request has already been reviewed.");

  const reviewed = await prisma.presidentialApprovalItem.update({
    where: { id },
    data: {
      status,
      reason: reason ?? null,
      reviewerId: actorId,
      reviewedAt: new Date()
    }
  });

  if (status === ApprovalStatus.APPROVED) {
    await applyApprovedItem(reviewed);
  } else if (item.targetType === PresidentialApprovalTargetType.SENSITIVE_FILE && item.targetId) {
    await prisma.file.update({
      where: { id: item.targetId },
      data: { approvalStatus: ApprovalStatus.REJECTED, rejectedReason: reason ?? "Rejected by president." }
    }).catch(() => null);
  }

  await logActivity({
    userId: actorId,
    workspaceId: reviewed.workspaceId ?? undefined,
    action: activityActions.presidentApprovalReviewed,
    targetId: reviewed.id,
    metadata: { targetType: reviewed.targetType, status: reviewed.status, title: reviewed.title }
  });

  return reviewed;
}

export async function getPresidentWallCenter(actorId: string) {
  if (!(await isPresidentAuthority(actorId))) {
    throw new ApiError(403, "Only the LETW president can open the President Approval Wall.");
  }
  const [policy, lockdown, approvals, workspaces] = await Promise.all([
    getApprovalWallPolicy(),
    getEmergencyLockdownState(),
    prisma.presidentialApprovalItem.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 500
    }),
    prisma.workspace.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, lockedAt: true, lockReason: true },
      orderBy: [{ lockedAt: "desc" }, { name: "asc" }],
      take: 250
    })
  ]);
  return {
    policy,
    lockdown,
    approvals,
    workspaces,
    stats: {
      pending: approvals.filter((item) => item.status === "PENDING").length,
      approved: approvals.filter((item) => item.status === "APPROVED").length,
      rejected: approvals.filter((item) => item.status === "REJECTED").length,
      lockdownActive: lockdown.active ? 1 : 0,
      lockedWorkspaces: workspaces.filter((workspace) => workspace.lockedAt).length
    }
  };
}

export function isSensitiveFileLike(file: {
  dlpRestricted?: boolean | null;
  downloadRestricted?: boolean | null;
  shareRestricted?: boolean | null;
  aiRestricted?: boolean | null;
  sensitivityLabel?: string | null;
}) {
  const label = file.sensitivityLabel ?? "INTERNAL";
  return Boolean(
    file.dlpRestricted ||
      file.shareRestricted ||
      file.aiRestricted ||
      ["LEADERSHIP_ONLY", "PASTORAL_CONFIDENTIAL", "FINANCE_CONFIDENTIAL", "BOARD_ONLY", "LEGAL_HOLD", "SAFEGUARDING_RESTRICTED"].includes(label)
  );
}
