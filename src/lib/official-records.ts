import { randomBytes } from "crypto";
import {
  OfficialCircularAcknowledgementStatus,
  OfficialCircularStatus,
  PastorTransferStatus,
  Prisma
} from "@prisma/client";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError } from "@/lib/api";
import { isPresidentDocumentAuthority } from "@/lib/governance";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function listFromText(value?: string[] | string | null) {
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean);
  return (value ?? "")
    .split("\n")
    .flatMap((line) => line.split(","))
    .map((item) => item.trim())
    .filter(Boolean);
}

function code(prefix: string) {
  return `${prefix}-${new Date().getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

function token() {
  return randomBytes(18).toString("hex");
}

export function pastorTransferSeal(record: { transferNumber: string }) {
  return record.transferNumber.replace("LETW-PT-", "LETW-SEAL-PT-");
}

export function circularSeal(record: { circularNumber: string }) {
  return record.circularNumber.replace("LETW-CIR-", "LETW-SEAL-CIR-");
}

export function pastorTransferActive(status: string) {
  return ["APPROVED", "ACTIVE", "COMPLETED"].includes(status);
}

export function circularActive(input: { status: string; expiresAt?: Date | null; revokedAt?: Date | null }) {
  return input.status === "ISSUED" && !input.revokedAt && (!input.expiresAt || input.expiresAt > new Date());
}

export async function requireOfficialRecordsAdmin(userId: string) {
  if ((await hasAnyWorkspaceAdminRole(userId)) || (await isPresidentDocumentAuthority(userId))) return;
  throw new ApiError(403, "Only LETW administrators or the president can manage official records.");
}

export async function getOfficialRecordsData(userId: string) {
  await requireOfficialRecordsAdmin(userId);
  const [users, units, workspaces, transfers, circulars, acknowledgements] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null, suspendedAt: null, accessRevokedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        category: true,
        memberProfile: { select: { organizationPosition: true, membershipNumber: true } }
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      take: 700
    }),
    prisma.organizationUnit.findMany({
      where: { active: true },
      select: { id: true, name: true, type: true, parentId: true, countryCode: true, code: true },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      take: 500
    }),
    prisma.workspace.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 500
    }),
    prisma.pastorTransferPosting.findMany({
      orderBy: [{ status: "asc" }, { effectiveAt: "desc" }, { createdAt: "desc" }],
      take: 250
    }),
    prisma.officialCircular.findMany({
      orderBy: [{ status: "asc" }, { issuedAt: "desc" }, { createdAt: "desc" }],
      take: 250
    }),
    prisma.officialCircularAcknowledgement.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 500
    })
  ]);

  return {
    users,
    units,
    workspaces,
    transfers,
    circulars,
    acknowledgements,
    metrics: {
      activeTransfers: transfers.filter((item) => pastorTransferActive(item.status)).length,
      pendingHandovers: transfers.filter((item) => item.status === "PENDING_HANDOVER").length,
      issuedCirculars: circulars.filter((item) => circularActive(item)).length,
      pendingAcknowledgements: acknowledgements.filter((item) => item.status === "PENDING").length
    }
  };
}

export async function createPastorTransferPosting(
  actorId: string,
  input: {
    pastorUserId: string;
    fromOrganizationUnitId?: string | null;
    toOrganizationUnitId?: string | null;
    fromWorkspaceId?: string | null;
    toWorkspaceId?: string | null;
    title: string;
    reason?: string | null;
    effectiveAt: string;
    handoverDueAt?: string | null;
    handoverChecklist?: string[] | string | null;
    housingNeeds?: string | null;
    resourceNeeds?: string | null;
    branchAssignmentHistory?: string[] | string | null;
    issueNow?: boolean;
  }
) {
  await requireOfficialRecordsAdmin(actorId);
  const transferNumber = code("LETW-PT");
  const created = await prisma.pastorTransferPosting.create({
    data: {
      transferNumber,
      sealNumber: pastorTransferSeal({ transferNumber }),
      verifyToken: token(),
      pastorUserId: input.pastorUserId,
      fromOrganizationUnitId: input.fromOrganizationUnitId ?? null,
      toOrganizationUnitId: input.toOrganizationUnitId ?? null,
      fromWorkspaceId: input.fromWorkspaceId ?? null,
      toWorkspaceId: input.toWorkspaceId ?? null,
      title: input.title,
      reason: input.reason ?? null,
      effectiveAt: new Date(input.effectiveAt),
      handoverDueAt: input.handoverDueAt ? new Date(input.handoverDueAt) : null,
      handoverChecklist: asJson(listFromText(input.handoverChecklist)),
      housingNeeds: input.housingNeeds ?? null,
      resourceNeeds: input.resourceNeeds ?? null,
      branchAssignmentHistory: asJson(listFromText(input.branchAssignmentHistory)),
      status: input.issueNow ? PastorTransferStatus.APPROVED : PastorTransferStatus.DRAFT,
      issuedById: actorId,
      approvedById: input.issueNow ? actorId : null,
      approvedAt: input.issueNow ? new Date() : null
    }
  });
  await logActivity({
    userId: actorId,
    action: activityActions.pastorTransferCreated,
    targetId: created.id,
    metadata: { transferNumber: created.transferNumber, status: created.status }
  });
  return created;
}

export async function updatePastorTransferPosting(actorId: string, id: string, status: PastorTransferStatus) {
  await requireOfficialRecordsAdmin(actorId);
  const data: Prisma.PastorTransferPostingUpdateInput = { status };
  if (["APPROVED", "ACTIVE"].includes(status)) {
    data.approvedById = actorId;
    data.approvedAt = new Date();
  }
  if (status === "COMPLETED") data.completedAt = new Date();
  if (status === "CANCELLED") data.cancelledAt = new Date();
  const updated = await prisma.pastorTransferPosting.update({ where: { id }, data });
  await logActivity({
    userId: actorId,
    action: activityActions.pastorTransferUpdated,
    targetId: updated.id,
    metadata: { transferNumber: updated.transferNumber, status: updated.status }
  });
  return updated;
}

export async function deletePastorTransferPosting(actorId: string, id: string) {
  await requireOfficialRecordsAdmin(actorId);
  const deleted = await prisma.pastorTransferPosting.delete({ where: { id } });
  await logActivity({
    userId: actorId,
    action: activityActions.pastorTransferDeleted,
    targetId: deleted.id,
    metadata: { transferNumber: deleted.transferNumber }
  });
  return deleted;
}

async function createCircularAcknowledgement(circularId: string, input: { organizationUnitId?: string | null; workspaceId?: string | null }) {
  return prisma.officialCircularAcknowledgement.create({
    data: {
      circularId,
      organizationUnitId: input.organizationUnitId ?? null,
      workspaceId: input.workspaceId ?? null,
      status: OfficialCircularAcknowledgementStatus.PENDING
    }
  });
}

export async function createOfficialCircular(
  actorId: string,
  input: {
    title: string;
    summary: string;
    body: string;
    category?: string | null;
    audienceType?: string | null;
    audienceLabel?: string | null;
    workspaceId?: string | null;
    organizationUnitId?: string | null;
    expiresAt?: string | null;
    requiresAcknowledgement?: boolean;
    issueNow?: boolean;
  }
) {
  await requireOfficialRecordsAdmin(actorId);
  const circularNumber = code("LETW-CIR");
  const issued = Boolean(input.issueNow);
  const circular = await prisma.officialCircular.create({
    data: {
      circularNumber,
      sealNumber: circularSeal({ circularNumber }),
      verifyToken: token(),
      title: input.title,
      summary: input.summary,
      body: input.body,
      category: input.category?.trim() || "LEADERSHIP",
      audienceType: input.audienceType?.trim() || "SELECTED_UNITS",
      audienceLabel: input.audienceLabel?.trim() || "Selected LETW leaders and branches",
      audience: asJson({
        workspaceId: input.workspaceId ?? null,
        organizationUnitId: input.organizationUnitId ?? null
      }),
      workspaceId: input.workspaceId ?? null,
      organizationUnitId: input.organizationUnitId ?? null,
      requiresAcknowledgement: input.requiresAcknowledgement ?? true,
      status: issued ? OfficialCircularStatus.ISSUED : OfficialCircularStatus.DRAFT,
      issuedById: actorId,
      issuedAt: issued ? new Date() : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null
    }
  });
  if (circular.requiresAcknowledgement) {
    await createCircularAcknowledgement(circular.id, {
      organizationUnitId: circular.organizationUnitId,
      workspaceId: circular.workspaceId
    });
  }
  await logActivity({
    userId: actorId,
    action: activityActions.officialCircularCreated,
    targetId: circular.id,
    metadata: { circularNumber: circular.circularNumber, status: circular.status }
  });
  return circular;
}

export async function updateOfficialCircular(actorId: string, id: string, status: OfficialCircularStatus) {
  await requireOfficialRecordsAdmin(actorId);
  const data: Prisma.OfficialCircularUpdateInput = { status };
  if (status === "ISSUED") data.issuedAt = new Date();
  if (status === "REVOKED") data.revokedAt = new Date();
  const updated = await prisma.officialCircular.update({ where: { id }, data });
  await logActivity({
    userId: actorId,
    action: activityActions.officialCircularUpdated,
    targetId: updated.id,
    metadata: { circularNumber: updated.circularNumber, status: updated.status }
  });
  return updated;
}

export async function acknowledgeOfficialCircular(actorId: string, acknowledgementId: string, note?: string | null) {
  const acknowledgement = await prisma.officialCircularAcknowledgement.update({
    where: { id: acknowledgementId },
    data: {
      acknowledgedById: actorId,
      status: OfficialCircularAcknowledgementStatus.ACKNOWLEDGED,
      note: note ?? null,
      acknowledgedAt: new Date()
    }
  });
  await logActivity({
    userId: actorId,
    action: activityActions.officialCircularAcknowledged,
    targetId: acknowledgement.circularId,
    metadata: { acknowledgementId: acknowledgement.id }
  });
  return acknowledgement;
}

export async function deleteOfficialCircular(actorId: string, id: string) {
  await requireOfficialRecordsAdmin(actorId);
  await prisma.officialCircularAcknowledgement.deleteMany({ where: { circularId: id } });
  const deleted = await prisma.officialCircular.delete({ where: { id } });
  await logActivity({
    userId: actorId,
    action: activityActions.officialCircularDeleted,
    targetId: deleted.id,
    metadata: { circularNumber: deleted.circularNumber }
  });
  return deleted;
}
