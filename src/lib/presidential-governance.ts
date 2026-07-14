import { PresidentialGovernanceControlStatus, PresidentialGovernanceControlType, Prisma } from "@prisma/client";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

export const presidentialGovernanceControls = [
  {
    type: PresidentialGovernanceControlType.DOCUMENT_POLICY_ENGINE,
    label: "Document Policy Engine",
    detail: "Rules for classification, ownership, expiry, legal hold, approval, sharing, and download restrictions.",
    severity: "HIGH"
  },
  {
    type: PresidentialGovernanceControlType.PRESIDENTIAL_APPROVAL_LOCK,
    label: "Presidential Approval Lock",
    detail: "Critical records cannot be issued, deleted, restored, or released without presidential authority.",
    severity: "CRITICAL"
  },
  {
    type: PresidentialGovernanceControlType.SENSITIVE_DOCUMENT_WATERMARKING,
    label: "Sensitive Document Watermarking",
    detail: "Protected previews add viewer identity, timestamp, LETW ownership text, and audit context where supported.",
    severity: "HIGH"
  },
  {
    type: PresidentialGovernanceControlType.SCREENSHOT_PRINT_RESTRICTION,
    label: "Screenshot / Print Restriction Mode",
    detail: "Read-only document viewing policy for members, with download and edit rights controlled separately.",
    severity: "HIGH"
  },
  {
    type: PresidentialGovernanceControlType.LEADERSHIP_ACCOUNTABILITY_SCORE,
    label: "Leadership Accountability Score",
    detail: "Review follow-up, decisions, handovers, reports, compliance, attendance, and delayed tasks by leader or branch.",
    severity: "NORMAL"
  },
  {
    type: PresidentialGovernanceControlType.BRANCH_RISK_ALERT,
    label: "Branch Risk Alert System",
    detail: "Surface weak branches, stale network units, unresolved incidents, missing reports, and inactive leadership structures.",
    severity: "HIGH"
  },
  {
    type: PresidentialGovernanceControlType.SECURE_GUEST_REVIEW_ROOM,
    label: "Secure Guest Review Room",
    detail: "Temporary reviewer access for outside auditors, lawyers, guests, or contractors without exposing full workspaces.",
    severity: "HIGH"
  },
  {
    type: PresidentialGovernanceControlType.CONFIDENTIAL_REDACTION,
    label: "Confidential Redaction Tool",
    detail: "Track redaction work for sensitive documents before sharing, printing, exporting, or public publishing.",
    severity: "HIGH"
  },
  {
    type: PresidentialGovernanceControlType.MINISTER_CREDENTIAL_REGISTER,
    label: "Minister Credential Register",
    detail: "Credential register for pastors, ministers, leaders, ordinations, appointments, transfers, renewals, and status.",
    severity: "NORMAL"
  },
  {
    type: PresidentialGovernanceControlType.INCIDENT_RESPONSE_CENTER,
    label: "Incident Response Center",
    detail: "Manage urgent operational, pastoral, safeguarding, facility, security, and welfare incidents with ownership and deadlines.",
    severity: "CRITICAL"
  },
  {
    type: PresidentialGovernanceControlType.OFFICIAL_CIRCULAR_SYSTEM,
    label: "Official Circular System",
    detail: "Issue controlled circulars with LETW number, audience, expiry, acknowledgment, and audit history.",
    severity: "NORMAL"
  },
  {
    type: PresidentialGovernanceControlType.MEMBER_PRIVACY_CONSENT,
    label: "Member Privacy Consent Center",
    detail: "Track consent for photos, data use, communications, pastoral care handling, and branch/member directory visibility.",
    severity: "HIGH"
  }
] as const;

type GovernanceRecordInput = {
  controlType: PresidentialGovernanceControlType;
  title: string;
  summary: string;
  status?: PresidentialGovernanceControlStatus;
  severity?: string;
  workspaceId?: string | null;
  organizationUnitId?: string | null;
  subjectUserId?: string | null;
  ownerUserId?: string | null;
  dueAt?: Date | null;
  metadata?: Prisma.InputJsonValue | null;
};

export async function getPresidentialGovernanceCenter(actorId: string) {
  await requireAnyWorkspaceAdmin(actorId, "Only administrators can open the presidential governance center.");
  const [
    records,
    sensitiveFiles,
    restrictedFiles,
    liveShareLinks,
    leaders,
    networkUnits,
    pendingDecisions,
    activeVaultRecords,
    pendingHandovers,
    issuedLetters,
    activeCards,
    activeCertificates,
    consentCampaigns
  ] = await Promise.all([
    prisma.presidentialGovernanceRecord.findMany({
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: 1000
    }),
    prisma.file.count({
      where: {
        deletedAt: null,
        OR: [
          { dlpRestricted: true },
          { aiRestricted: true },
          { shareRestricted: true },
          { downloadRestricted: true },
          { sensitivityLabel: { in: ["LEADERSHIP_ONLY", "PASTORAL_CONFIDENTIAL", "FINANCE_CONFIDENTIAL", "BOARD_ONLY", "LEGAL_HOLD", "SAFEGUARDING_RESTRICTED"] } }
        ]
      }
    }),
    prisma.file.count({ where: { deletedAt: null, OR: [{ downloadRestricted: true }, { shareRestricted: true }, { aiRestricted: true }] } }),
    prisma.fileShareLink.count({ where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } }),
    prisma.workspaceMember.count({ where: { role: { in: ["ADMIN", "LEADER", "MODERATOR"] } } }),
    prisma.organizationUnit.count({ where: { active: true } }),
    prisma.leadershipDecision.count({ where: { status: { in: ["PENDING", "DELAYED"] } } }),
    prisma.confidentialVaultRecord.count({ where: { status: "OPEN" } }),
    prisma.leadershipHandover.count({ where: { status: { in: ["DRAFT", "PENDING_ACCEPTANCE"] } } }),
    prisma.officialLetter.count({ where: { status: "ISSUED" } }),
    prisma.digitalMembershipCard.count({ where: { status: "ACTIVE", deletedAt: null } }),
    prisma.memberCertificationBadge.count({ where: { status: "ACTIVE" } }),
    prisma.memberComplianceCampaign.count({ where: { status: { in: ["DRAFT", "ACTIVE"] } } })
  ]);

  return {
    controls: presidentialGovernanceControls,
    records,
    stats: {
      activeControls: records.filter((record) => record.status === "ACTIVE").length,
      pendingReview: records.filter((record) => record.status === "PENDING_REVIEW").length,
      criticalControls: records.filter((record) => record.severity === "CRITICAL" && record.status !== "RESOLVED").length,
      sensitiveFiles,
      restrictedFiles,
      liveShareLinks,
      leaders,
      networkUnits,
      pendingDecisions,
      activeVaultRecords,
      pendingHandovers,
      issuedLetters,
      activeCards,
      activeCertificates,
      consentCampaigns
    }
  };
}

export async function createPresidentialGovernanceRecord(actorId: string, input: GovernanceRecordInput) {
  await requireAnyWorkspaceAdmin(actorId, "Only administrators can create presidential governance controls.");
  const record = await prisma.presidentialGovernanceRecord.create({
    data: {
      controlType: input.controlType,
      title: input.title,
      summary: input.summary,
      status: input.status ?? "ACTIVE",
      severity: input.severity ?? "NORMAL",
      workspaceId: input.workspaceId ?? null,
      organizationUnitId: input.organizationUnitId ?? null,
      subjectUserId: input.subjectUserId ?? null,
      ownerUserId: input.ownerUserId ?? null,
      dueAt: input.dueAt ?? null,
      metadata: input.metadata ?? Prisma.JsonNull,
      createdById: actorId
    }
  });
  await logActivity({
    userId: actorId,
    action: activityActions.presidentialGovernanceCreated,
    targetId: record.id,
    metadata: { controlType: record.controlType, status: record.status }
  });
  return record;
}

export async function updatePresidentialGovernanceRecord(actorId: string, id: string, input: Partial<GovernanceRecordInput>) {
  await requireAnyWorkspaceAdmin(actorId, "Only administrators can update presidential governance controls.");
  const existing = await prisma.presidentialGovernanceRecord.findUnique({ where: { id }, select: { id: true } });
  if (!existing) throw new ApiError(404, "Governance control record not found.");

  const record = await prisma.presidentialGovernanceRecord.update({
    where: { id },
    data: {
      controlType: input.controlType,
      title: input.title,
      summary: input.summary,
      status: input.status,
      severity: input.severity,
      workspaceId: input.workspaceId,
      organizationUnitId: input.organizationUnitId,
      subjectUserId: input.subjectUserId,
      ownerUserId: input.ownerUserId,
      dueAt: input.dueAt,
      metadata: input.metadata === undefined ? undefined : input.metadata ?? Prisma.JsonNull,
      updatedById: actorId,
      resolvedAt: input.status === "RESOLVED" ? new Date() : input.status === undefined ? undefined : null
    }
  });
  await logActivity({
    userId: actorId,
    action: activityActions.presidentialGovernanceUpdated,
    targetId: record.id,
    metadata: { controlType: record.controlType, status: record.status }
  });
  return record;
}

export async function deletePresidentialGovernanceRecord(actorId: string, id: string) {
  await requireAnyWorkspaceAdmin(actorId, "Only administrators can delete presidential governance controls.");
  const record = await prisma.presidentialGovernanceRecord.delete({ where: { id } });
  await logActivity({
    userId: actorId,
    action: activityActions.presidentialGovernanceDeleted,
    targetId: id,
    metadata: { controlType: record.controlType, status: record.status }
  });
  return record;
}

export async function activateBaselineGovernanceControls(actorId: string) {
  await requireAnyWorkspaceAdmin(actorId, "Only administrators can activate presidential governance controls.");
  const existing = await prisma.presidentialGovernanceRecord.findMany({
    where: {
      controlType: { in: presidentialGovernanceControls.map((control) => control.type) },
      status: { notIn: ["ARCHIVED", "REVOKED"] }
    },
    select: { controlType: true }
  });
  const existingTypes = new Set(existing.map((record) => record.controlType));
  const missing = presidentialGovernanceControls.filter((control) => !existingTypes.has(control.type));

  if (!missing.length) return { count: 0 };

  await prisma.presidentialGovernanceRecord.createMany({
    data: missing.map((control) => ({
      controlType: control.type,
      title: control.label,
      summary: control.detail,
      severity: control.severity,
      status: "ACTIVE",
      createdById: actorId
    }))
  });

  await logActivity({
    userId: actorId,
    action: activityActions.presidentialGovernanceCreated,
    metadata: { baselineControls: missing.map((control) => control.type), count: missing.length }
  });

  return { count: missing.length };
}

export async function clearPresidentialGovernanceLogs(actorId: string) {
  await requireAnyWorkspaceAdmin(actorId, "Only administrators can clear presidential governance logs.");
  const deleted = await prisma.activityLog.deleteMany({
    where: {
      action: {
        in: [
          activityActions.presidentialGovernanceCreated,
          activityActions.presidentialGovernanceUpdated,
          activityActions.presidentialGovernanceDeleted,
          activityActions.presidentialGovernanceLogsCleared
        ]
      }
    }
  });
  await logActivity({
    userId: actorId,
    action: activityActions.presidentialGovernanceLogsCleared,
    metadata: { deleted: deleted.count }
  });
  return deleted;
}
