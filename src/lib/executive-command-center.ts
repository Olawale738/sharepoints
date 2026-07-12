import { createHash, randomBytes } from "crypto";
import {
  ApprovalStatus,
  DigitalSignatureStatus,
  EvidenceVaultStatus,
  EvidenceVaultType,
  LeadershipDecisionStatus,
  LeadershipHandoverStatus,
  MediaArchiveType,
  MonthlyReportStatus,
  PresidentialActionPriority,
  PresidentialActionStatus,
  Prisma,
  SermonResourceVisibility,
  WhatsAppCommandStatus,
  WorkspaceRole
} from "@prisma/client";

import { activityActions, logActivity } from "@/lib/activity";
import { generateAiText, isAiTextConfigured } from "@/lib/ai-provider";
import { ApiError } from "@/lib/api";
import { requireLeadershipGovernanceScopeAccess } from "@/lib/leadership-governance";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import {
  hasAnyWorkspaceAdminRole,
  hasAnyWorkspacePermission,
  requireAnyWorkspacePermission
} from "@/lib/rbac";

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function requestContext(request?: Request) {
  return {
    ipAddress: request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: request?.headers.get("user-agent") ?? null
  };
}

function generateHash(...parts: Array<string | null | undefined>) {
  return createHash("sha256")
    .update([...parts, Date.now().toString(), randomBytes(16).toString("hex")].filter(Boolean).join(":"))
    .digest("hex");
}

export async function getExecutiveCommandAccess(userId: string) {
  const [
    isAdmin,
    canUseWhatsAppCommandBot,
    canManageDigitalSignatures,
    canManageEvidenceVault,
    canViewExecutiveBriefing,
    canManagePresidentialActions,
    canManageMediaArchive,
    canUseExecutiveSecretary
  ] = await Promise.all([
    hasAnyWorkspaceAdminRole(userId),
    hasAnyWorkspacePermission(userId, "canUseWhatsAppCommandBot"),
    hasAnyWorkspacePermission(userId, "canManageDigitalSignatures"),
    hasAnyWorkspacePermission(userId, "canManageEvidenceVault"),
    hasAnyWorkspacePermission(userId, "canViewExecutiveBriefing"),
    hasAnyWorkspacePermission(userId, "canManagePresidentialActions"),
    hasAnyWorkspacePermission(userId, "canManageMediaArchive"),
    hasAnyWorkspacePermission(userId, "canUseExecutiveSecretary")
  ]);

  return {
    isAdmin,
    canUseWhatsAppCommandBot,
    canManageDigitalSignatures,
    canManageEvidenceVault,
    canViewExecutiveBriefing,
    canManagePresidentialActions,
    canManageMediaArchive,
    canUseExecutiveSecretary
  };
}

export function parseWhatsAppAdminCommand(command: string) {
  const lower = command.toLowerCase();
  if (lower.includes("pending report")) {
    return {
      parsedIntent: "SHOW_PENDING_REPORTS",
      targetScope: "reports",
      draftAction: {
        title: "Show pending reports",
        summary: "Prepare a leadership briefing of generated or draft monthly reports that still need final review.",
        approvalRequired: true,
        nextSteps: [
          "Open the executive briefing room.",
          "Review generated monthly reports.",
          "Mark complete reports as final or assign follow-up owners."
        ]
      }
    };
  }

  if (lower.includes("remind") && lower.includes("leader")) {
    const target = command.match(/remind\s+(.+?)(?:\s+to\s+|\s+about\s+|$)/i)?.[1]?.trim() || "leaders";
    return {
      parsedIntent: "REMIND_LEADERS",
      targetScope: target,
      draftAction: {
        title: `Reminder for ${target}`,
        summary: "Draft a reminder to the requested leadership group. Admin approval is required before sending.",
        approvalRequired: true,
        draftMessage:
          "Peace be unto you. Kindly review your pending LETW assignments, reports, meetings, and follow-up actions before the next leadership review."
      }
    };
  }

  if (lower.includes("sunday") && lower.includes("service")) {
    return {
      parsedIntent: "CREATE_SERVICE_PLAN",
      targetScope: "service planning",
      draftAction: {
        title: "Create Sunday service plan",
        summary: "Draft a Sunday service planning checklist for ministers, choir, media, ushers, protocol, prayer, and post-service reporting.",
        approvalRequired: true,
        checklist: [
          "Opening prayer and worship lead",
          "Choir songs and minister lineup",
          "Media and livestream readiness",
          "Ushers, protocol, and welfare assignments",
          "Offering/giving capture",
          "Attendance and visitor follow-up",
          "Post-service report"
        ]
      }
    };
  }

  return {
    parsedIntent: "GENERAL_EXECUTIVE_COMMAND",
    targetScope: "executive",
    draftAction: {
      title: "General admin command",
      summary: "LETW captured this command as a draft. Review it, refine the action, then approve or cancel.",
      approvalRequired: true,
      originalCommand: command
    }
  };
}

async function visibleWorkspaceIds(userId: string, isAdmin: boolean) {
  const rows = await prisma.workspaceMember.findMany({
    where: {
      ...(isAdmin ? {} : { userId }),
      role: isAdmin ? { in: [WorkspaceRole.ADMIN, WorkspaceRole.LEADER, WorkspaceRole.MODERATOR] } : undefined,
      workspace: { deletedAt: null }
    },
    select: { workspaceId: true },
    distinct: ["workspaceId"],
    take: 500
  });
  return rows.map((row) => row.workspaceId);
}

export async function getExecutiveCommandCenterData(userId: string) {
  const access = await getExecutiveCommandAccess(userId);
  if (
    !access.canViewExecutiveBriefing &&
    !access.canUseWhatsAppCommandBot &&
    !access.canManageDigitalSignatures &&
    !access.canManageEvidenceVault &&
    !access.canManagePresidentialActions &&
    !access.canManageMediaArchive &&
    !access.canUseExecutiveSecretary
  ) {
    throw new ApiError(403, "You do not have executive command permissions.");
  }

  const workspaceIds = await visibleWorkspaceIds(userId, access.isAdmin);
  const workspaceWhere = access.isAdmin ? {} : { workspaceId: { in: workspaceIds.length ? workspaceIds : ["__none__"] } };
  const now = new Date();
  const soon = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 14);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();

  const [
    workspaces,
    units,
    users,
    pendingApprovals,
    urgentDecisions,
    delayedHandovers,
    pendingReports,
    openVaultRecords,
    upcomingMeetings,
    recentReports,
    commands,
    signatures,
    evidence,
    presidentialActions,
    mediaArchive
  ] = await Promise.all([
    prisma.workspace.findMany({
      where: access.isAdmin ? { deletedAt: null } : { id: { in: workspaceIds.length ? workspaceIds : ["__none__"] }, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
      take: 300
    }),
    prisma.organizationUnit.findMany({
      where: { active: true },
      select: { id: true, name: true, type: true, countryCode: true, code: true },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      take: access.isAdmin ? 300 : 80
    }),
    prisma.user.findMany({
      where: { deletedAt: null, suspendedAt: null, accessRevokedAt: null },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      take: 500
    }),
    access.canViewExecutiveBriefing
      ? prisma.approvalRequest.count({ where: { status: "PENDING", ...workspaceWhere } })
      : Promise.resolve(0),
    access.canViewExecutiveBriefing
      ? prisma.leadershipDecision.findMany({
          where: {
            status: { in: [LeadershipDecisionStatus.PENDING, LeadershipDecisionStatus.DELAYED] },
            ...(access.isAdmin ? {} : { workspaceId: { in: workspaceIds.length ? workspaceIds : ["__none__"] } })
          },
          select: { id: true, title: true, status: true, dueAt: true, createdAt: true },
          orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }],
          take: 12
        })
      : Promise.resolve([]),
    access.canViewExecutiveBriefing
      ? prisma.leadershipHandover.findMany({
          where: {
            status: { in: [LeadershipHandoverStatus.DRAFT, LeadershipHandoverStatus.PENDING_ACCEPTANCE, LeadershipHandoverStatus.ACCEPTED] },
            ...(access.isAdmin ? {} : { workspaceId: { in: workspaceIds.length ? workspaceIds : ["__none__"] } })
          },
          select: { id: true, title: true, status: true, createdAt: true },
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          take: 12
        })
      : Promise.resolve([]),
    access.canViewExecutiveBriefing
      ? prisma.monthlyMinistryReport.findMany({
          where: {
            status: { in: [MonthlyReportStatus.DRAFT, MonthlyReportStatus.GENERATED] },
            ...(access.isAdmin ? {} : { workspaceId: { in: workspaceIds.length ? workspaceIds : ["__none__"] } })
          },
          select: { id: true, title: true, status: true, month: true, year: true, createdAt: true },
          orderBy: [{ year: "desc" }, { month: "desc" }, { createdAt: "desc" }],
          take: 12
        })
      : Promise.resolve([]),
    access.canViewExecutiveBriefing
      ? prisma.confidentialVaultRecord.count({
          where: {
            status: { in: ["OPEN", "ACTIVE"] },
            ...(access.isAdmin ? {} : { workspaceId: { in: workspaceIds.length ? workspaceIds : ["__none__"] } })
          }
        })
      : Promise.resolve(0),
    access.canViewExecutiveBriefing
      ? prisma.workspaceMeeting.findMany({
          where: {
            startsAt: { gte: now, lte: soon },
            cancelledAt: null,
            ...(access.isAdmin ? {} : { workspaceId: { in: workspaceIds.length ? workspaceIds : ["__none__"] } })
          },
          select: { id: true, title: true, meetingType: true, startsAt: true, workspaceId: true },
          orderBy: { startsAt: "asc" },
          take: 12
        })
      : Promise.resolve([]),
    access.canViewExecutiveBriefing
      ? prisma.monthlyMinistryReport.findMany({
          where: {
            month,
            year,
            createdAt: { gte: monthStart },
            ...(access.isAdmin ? {} : { workspaceId: { in: workspaceIds.length ? workspaceIds : ["__none__"] } })
          },
          select: { organizationUnitId: true, workspaceId: true },
          take: 500
        })
      : Promise.resolve([]),
    access.canUseWhatsAppCommandBot
      ? prisma.whatsAppAdminCommand.findMany({ orderBy: { createdAt: "desc" }, take: 80 })
      : Promise.resolve([]),
    access.canManageDigitalSignatures
      ? prisma.digitalSignature.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100 })
      : Promise.resolve([]),
    access.canManageEvidenceVault
      ? prisma.confidentialEvidenceItem.findMany({ orderBy: [{ status: "asc" }, { updatedAt: "desc" }], take: 100 })
      : Promise.resolve([]),
    access.canManagePresidentialActions || access.canViewExecutiveBriefing
      ? prisma.presidentialActionItem.findMany({
          where: access.isAdmin
            ? {}
            : {
                OR: [
                  { assignedToId: userId },
                  { createdById: userId },
                  { workspaceId: { in: workspaceIds.length ? workspaceIds : ["__none__"] } }
                ]
              },
          orderBy: [{ status: "asc" }, { priority: "desc" }, { dueAt: "asc" }, { createdAt: "desc" }],
          take: 120
        })
      : Promise.resolve([]),
    access.canManageMediaArchive || access.canViewExecutiveBriefing
      ? prisma.sermonResource.findMany({
          where: access.isAdmin
            ? {}
            : {
                OR: [
                  { createdById: userId },
                  { workspaceId: { in: workspaceIds.length ? workspaceIds : ["__none__"] } },
                  { visibility: { in: [SermonResourceVisibility.MEMBERS, SermonResourceVisibility.PUBLIC] }, approvalStatus: ApprovalStatus.APPROVED }
                ]
              },
          orderBy: [{ approvalStatus: "asc" }, { createdAt: "desc" }],
          take: 120
        })
      : Promise.resolve([])
  ]);

  const reportedUnitIds = new Set(recentReports.map((report) => report.organizationUnitId).filter(Boolean));
  const weakBranches = access.canViewExecutiveBriefing
    ? units
        .filter((unit) => ["BRANCH", "CHURCH", "MINISTRY"].includes(unit.type))
        .filter((unit) => !reportedUnitIds.has(unit.id))
        .slice(0, 8)
    : [];

  return {
    access,
    workspaces,
    units,
    users,
    briefing: {
      pendingApprovals,
      urgentDecisions,
      delayedHandovers,
      pendingReports,
      openVaultRecords,
      upcomingMeetings,
      weakBranches,
      generatedAt: now.toISOString()
    },
    commands,
    signatures,
    evidence,
    presidentialActions,
    mediaArchive
  };
}

export async function createWhatsAppAdminCommand(actorId: string, command: string, source?: { conversationId?: string | null; messageId?: string | null }) {
  await requireAnyWorkspacePermission(actorId, "canUseWhatsAppCommandBot", "Your role cannot use the WhatsApp admin command bot.");
  const parsed = parseWhatsAppAdminCommand(command);
  const result = await prisma.whatsAppAdminCommand.create({
    data: {
      command,
      parsedIntent: parsed.parsedIntent,
      targetScope: parsed.targetScope,
      draftAction: asJson(parsed.draftAction),
      requestedById: actorId,
      sourceConversationId: source?.conversationId ?? null,
      sourceMessageId: source?.messageId ?? null
    }
  });
  await logActivity({
    userId: actorId,
    action: activityActions.whatsAppAdminCommandCreated,
    targetId: result.id,
    metadata: { parsedIntent: result.parsedIntent, status: result.status }
  });
  return result;
}

export async function updateWhatsAppAdminCommand(actorId: string, id: string, status: WhatsAppCommandStatus, resultSummary?: string | null) {
  await requireAnyWorkspacePermission(actorId, "canUseWhatsAppCommandBot", "Your role cannot manage WhatsApp admin commands.");
  const existing = await prisma.whatsAppAdminCommand.findUnique({ where: { id }, select: { id: true, requestedById: true } });
  if (!existing) throw new ApiError(404, "WhatsApp admin command not found.");
  const updated = await prisma.whatsAppAdminCommand.update({
    where: { id },
    data: {
      status,
      resultSummary: resultSummary ?? undefined,
      approvedById: status === WhatsAppCommandStatus.APPROVED ? actorId : undefined,
      approvedAt: status === WhatsAppCommandStatus.APPROVED ? new Date() : undefined,
      sentAt: status === WhatsAppCommandStatus.SENT ? new Date() : undefined
    }
  });
  await notifyUsers([existing.requestedById], {
    type: "WHATSAPP_COMMAND",
    title: "WhatsApp admin command updated",
    body: `${updated.parsedIntent.replaceAll("_", " ").toLowerCase()} is now ${updated.status.toLowerCase()}.`,
    href: "/dashboard/executive-briefing"
  });
  await logActivity({
    userId: actorId,
    action: activityActions.whatsAppAdminCommandUpdated,
    targetId: id,
    metadata: { status }
  });
  return updated;
}

export async function createDigitalSignature(actorId: string, input: {
  targetType: string;
  targetId: string;
  title: string;
  signerId?: string | null;
  signerName: string;
  signerEmail?: string | null;
}) {
  await requireAnyWorkspacePermission(actorId, "canManageDigitalSignatures", "Your role cannot request digital signatures.");
  const signature = await prisma.digitalSignature.create({
    data: {
      targetType: input.targetType,
      targetId: input.targetId,
      title: input.title,
      signerId: input.signerId ?? null,
      signerName: input.signerName,
      signerEmail: input.signerEmail ?? null,
      requestedById: actorId,
      verificationHash: generateHash(input.targetType, input.targetId, input.signerName)
    }
  });
  if (signature.signerId) {
    await notifyUsers([signature.signerId], {
      type: "DIGITAL_SIGNATURE",
      title: "Signature requested",
      body: signature.title,
      href: "/dashboard/executive-briefing"
    });
  }
  await logActivity({
    userId: actorId,
    action: activityActions.digitalSignatureRequested,
    targetId: signature.id,
    metadata: { targetType: signature.targetType, targetId: signature.targetId }
  });
  return signature;
}

export async function updateDigitalSignature(actorId: string, id: string, action: "SIGN" | "REVOKE", request?: Request, signatureName?: string | null) {
  await requireAnyWorkspacePermission(actorId, "canManageDigitalSignatures", "Your role cannot manage digital signatures.");
  const existing = await prisma.digitalSignature.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Digital signature not found.");
  const context = requestContext(request);
  const data =
    action === "SIGN"
      ? {
          status: DigitalSignatureStatus.SIGNED,
          signatureName: signatureName || existing.signerName,
          signedAt: new Date(),
          revokedAt: null,
          ipAddress: context.ipAddress,
          userAgent: context.userAgent,
          verificationHash: generateHash(existing.targetType, existing.targetId, existing.signerName, "signed")
        }
      : {
          status: DigitalSignatureStatus.REVOKED,
          revokedAt: new Date(),
          verificationHash: generateHash(existing.targetType, existing.targetId, existing.signerName, "revoked")
        };
  const updated = await prisma.digitalSignature.update({ where: { id }, data });
  await logActivity({
    userId: actorId,
    action: action === "SIGN" ? activityActions.digitalSignatureSigned : activityActions.digitalSignatureRevoked,
    targetId: id,
    metadata: { targetType: existing.targetType, targetId: existing.targetId }
  });
  return updated;
}

export async function createConfidentialEvidence(actorId: string, input: {
  evidenceType: EvidenceVaultType;
  title: string;
  subjectName?: string | null;
  summary: string;
  sourceUrl?: string | null;
  workspaceId?: string | null;
  organizationUnitId?: string | null;
}) {
  await requireAnyWorkspacePermission(actorId, "canManageEvidenceVault", "Your role cannot manage the confidential evidence vault.");
  await requireLeadershipGovernanceScopeAccess(actorId, input);
  const item = await prisma.confidentialEvidenceItem.create({
    data: {
      evidenceType: input.evidenceType,
      title: input.title,
      subjectName: input.subjectName ?? null,
      summary: input.summary,
      sourceUrl: input.sourceUrl ?? null,
      workspaceId: input.workspaceId ?? null,
      organizationUnitId: input.organizationUnitId ?? null,
      createdById: actorId
    }
  });
  await prisma.confidentialEvidenceAccessLog.create({
    data: {
      evidenceId: item.id,
      userId: actorId,
      action: "CREATE"
    }
  });
  await logActivity({
    userId: actorId,
    workspaceId: item.workspaceId ?? undefined,
    action: activityActions.confidentialEvidenceCreated,
    targetId: item.id,
    metadata: { evidenceType: item.evidenceType, status: item.status }
  });
  return item;
}

export async function updateConfidentialEvidence(actorId: string, id: string, status: EvidenceVaultStatus, request?: Request, legalHold?: boolean | null) {
  await requireAnyWorkspacePermission(actorId, "canManageEvidenceVault", "Your role cannot manage the confidential evidence vault.");
  const existing = await prisma.confidentialEvidenceItem.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Evidence item not found.");
  await requireLeadershipGovernanceScopeAccess(actorId, existing);
  const context = requestContext(request);
  const item = await prisma.confidentialEvidenceItem.update({
    where: { id },
    data: {
      status,
      legalHold: legalHold ?? (status === EvidenceVaultStatus.LEGAL_HOLD ? true : existing.legalHold)
    }
  });
  await prisma.confidentialEvidenceAccessLog.create({
    data: {
      evidenceId: id,
      userId: actorId,
      action: "UPDATE",
      ipAddress: context.ipAddress,
      userAgent: context.userAgent
    }
  });
  await logActivity({
    userId: actorId,
    workspaceId: existing.workspaceId ?? undefined,
    action: activityActions.confidentialEvidenceUpdated,
    targetId: id,
    metadata: { status: item.status, legalHold: item.legalHold }
  });
  return item;
}

export async function createPresidentialAction(actorId: string, input: {
  title: string;
  description: string;
  category?: string | null;
  priority?: PresidentialActionPriority;
  assignedToId?: string | null;
  dueAt?: string | null;
  workspaceId?: string | null;
  organizationUnitId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
}) {
  await requireAnyWorkspacePermission(actorId, "canManagePresidentialActions", "Your role cannot manage the Presidential Action Desk.");
  await requireLeadershipGovernanceScopeAccess(actorId, input);
  const action = await prisma.presidentialActionItem.create({
    data: {
      title: input.title,
      description: input.description,
      category: input.category || "EXECUTIVE",
      priority: input.priority ?? PresidentialActionPriority.HIGH,
      assignedToId: input.assignedToId ?? null,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      workspaceId: input.workspaceId ?? null,
      organizationUnitId: input.organizationUnitId ?? null,
      sourceType: input.sourceType ?? null,
      sourceId: input.sourceId ?? null,
      createdById: actorId
    }
  });
  if (action.assignedToId) {
    await notifyUsers([action.assignedToId], {
      type: "PRESIDENTIAL_ACTION",
      title: "Presidential action assigned",
      body: action.title,
      href: "/dashboard/executive-briefing"
    });
  }
  await logActivity({
    userId: actorId,
    workspaceId: action.workspaceId ?? undefined,
    action: activityActions.presidentialActionCreated,
    targetId: action.id,
    metadata: { priority: action.priority, status: action.status }
  });
  return action;
}

export async function updatePresidentialAction(actorId: string, id: string, input: {
  status: PresidentialActionStatus;
  assignedToId?: string | null;
  decisionNote?: string | null;
  dueAt?: string | null;
}) {
  await requireAnyWorkspacePermission(actorId, "canManagePresidentialActions", "Your role cannot manage the Presidential Action Desk.");
  const existing = await prisma.presidentialActionItem.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Presidential action not found.");
  await requireLeadershipGovernanceScopeAccess(actorId, existing);
  const isDecisionStatus = input.status === PresidentialActionStatus.APPROVED || input.status === PresidentialActionStatus.REJECTED;
  const action = await prisma.presidentialActionItem.update({
    where: { id },
    data: {
      status: input.status,
      assignedToId: input.assignedToId === undefined ? undefined : input.assignedToId,
      dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
      decisionNote: input.decisionNote === undefined ? undefined : input.decisionNote,
      decidedById: isDecisionStatus ? actorId : undefined,
      decidedAt: isDecisionStatus ? new Date() : undefined,
      completedAt: input.status === PresidentialActionStatus.COMPLETED ? new Date() : undefined
    }
  });
  if (action.assignedToId && action.assignedToId !== existing.assignedToId) {
    await notifyUsers([action.assignedToId], {
      type: "PRESIDENTIAL_ACTION",
      title: "Presidential action assigned",
      body: action.title,
      href: "/dashboard/executive-briefing"
    });
  }
  await logActivity({
    userId: actorId,
    workspaceId: action.workspaceId ?? undefined,
    action: activityActions.presidentialActionUpdated,
    targetId: id,
    metadata: { status: action.status, assignedToId: action.assignedToId }
  });
  return action;
}

export async function deletePresidentialAction(actorId: string, id: string) {
  await requireAnyWorkspacePermission(actorId, "canManagePresidentialActions", "Your role cannot delete Presidential Action Desk records.");
  const existing = await prisma.presidentialActionItem.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Presidential action not found.");
  await requireLeadershipGovernanceScopeAccess(actorId, existing);
  await prisma.presidentialActionItem.delete({ where: { id } });
  await logActivity({
    userId: actorId,
    workspaceId: existing.workspaceId ?? undefined,
    action: activityActions.presidentialActionDeleted,
    targetId: id,
    metadata: { title: existing.title, status: existing.status }
  });
  return existing;
}

export async function createMediaArchiveResource(actorId: string, input: {
  workspaceId?: string | null;
  organizationUnitId?: string | null;
  title: string;
  speaker: string;
  scripture?: string | null;
  language?: string | null;
  mediaType?: MediaArchiveType;
  mediaUrl?: string | null;
  mediaStorageKey?: string | null;
  mediaFileName?: string | null;
  mediaFileType?: string | null;
  mediaSize?: number | null;
  notes?: string | null;
  visibility?: SermonResourceVisibility;
  tags?: string[] | null;
  retentionLabel?: string | null;
}) {
  await requireAnyWorkspacePermission(actorId, "canManageMediaArchive", "Your role cannot manage the secure media archive.");
  await requireLeadershipGovernanceScopeAccess(actorId, input);
  const resource = await prisma.sermonResource.create({
    data: {
      workspaceId: input.workspaceId ?? null,
      organizationUnitId: input.organizationUnitId ?? null,
      title: input.title,
      speaker: input.speaker,
      scripture: input.scripture ?? null,
      language: (input.language || "en").toLowerCase(),
      mediaType: input.mediaType ?? MediaArchiveType.LINK,
      mediaUrl: input.mediaUrl ?? null,
      mediaStorageKey: input.mediaStorageKey ?? null,
      mediaFileName: input.mediaFileName ?? null,
      mediaFileType: input.mediaFileType ?? null,
      mediaSize: input.mediaSize ?? null,
      notes: input.notes ?? null,
      visibility: input.visibility ?? SermonResourceVisibility.MEMBERS,
      approvalStatus: ApprovalStatus.PENDING,
      tags: asJson(input.tags ?? []),
      retentionLabel: input.retentionLabel ?? "LETW media archive",
      createdById: actorId
    }
  });
  await logActivity({
    userId: actorId,
    workspaceId: resource.workspaceId ?? undefined,
    action: activityActions.mediaArchiveUploaded,
    targetId: resource.id,
    metadata: { mediaType: resource.mediaType, approvalStatus: resource.approvalStatus, visibility: resource.visibility }
  });
  return resource;
}

export async function updateMediaArchiveResource(actorId: string, id: string, input: {
  approvalStatus?: ApprovalStatus;
  visibility?: SermonResourceVisibility;
  isFeatured?: boolean;
  transcriptSummary?: string | null;
  transcript?: string | null;
}) {
  await requireAnyWorkspacePermission(actorId, "canManageMediaArchive", "Your role cannot manage the secure media archive.");
  const existing = await prisma.sermonResource.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Media archive item not found.");
  await requireLeadershipGovernanceScopeAccess(actorId, existing);
  const resource = await prisma.sermonResource.update({
    where: { id },
    data: {
      approvalStatus: input.approvalStatus,
      visibility: input.visibility,
      isFeatured: input.isFeatured,
      transcriptSummary: input.transcriptSummary === undefined ? undefined : input.transcriptSummary,
      transcript: input.transcript === undefined ? undefined : input.transcript,
      approvedById: input.approvalStatus === ApprovalStatus.APPROVED ? actorId : undefined,
      approvedAt: input.approvalStatus === ApprovalStatus.APPROVED ? new Date() : undefined
    }
  });
  await logActivity({
    userId: actorId,
    workspaceId: resource.workspaceId ?? undefined,
    action: activityActions.mediaArchiveUpdated,
    targetId: id,
    metadata: { approvalStatus: resource.approvalStatus, visibility: resource.visibility, isFeatured: resource.isFeatured }
  });
  return resource;
}

export async function deleteMediaArchiveResource(actorId: string, id: string) {
  await requireAnyWorkspacePermission(actorId, "canManageMediaArchive", "Your role cannot delete media archive records.");
  const existing = await prisma.sermonResource.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, "Media archive item not found.");
  await requireLeadershipGovernanceScopeAccess(actorId, existing);
  await prisma.sermonResource.delete({ where: { id } });
  await logActivity({
    userId: actorId,
    workspaceId: existing.workspaceId ?? undefined,
    action: activityActions.mediaArchiveDeleted,
    targetId: id,
    metadata: { title: existing.title, mediaType: existing.mediaType }
  });
  return existing;
}

function executiveSecretaryFallback(prompt: string, data: Awaited<ReturnType<typeof getExecutiveCommandCenterData>>) {
  const lines = [
    "LETW AI Executive Secretary briefing",
    "",
    `Prompt: ${prompt}`,
    `Pending approvals: ${data.briefing.pendingApprovals}`,
    `Pending command drafts: ${data.commands.filter((item) => item.status === "PENDING_APPROVAL").length}`,
    `Pending presidential actions: ${data.presidentialActions.filter((item) => !["COMPLETED", "ARCHIVED", "REJECTED"].includes(item.status)).length}`,
    `Pending signatures: ${data.signatures.filter((item) => item.status === "REQUESTED").length}`,
    `Open restricted vault records: ${data.briefing.openVaultRecords}`,
    `Media awaiting approval: ${data.mediaArchive.filter((item) => item.approvalStatus === "PENDING").length}`,
    "",
    "Recommended next actions:",
    "- Review urgent decisions and delayed handovers.",
    "- Finalize pending monthly reports.",
    "- Approve or reject media items before public publishing.",
    "- Assign owners and due dates to presidential actions."
  ];
  return lines.join("\n");
}

export async function askExecutiveSecretary(actorId: string, prompt: string) {
  await requireAnyWorkspacePermission(actorId, "canUseExecutiveSecretary", "Your role cannot use the AI Executive Secretary.");
  const data = await getExecutiveCommandCenterData(actorId);
  const sources = [
    { type: "briefing", count: data.briefing.urgentDecisions.length + data.briefing.pendingReports.length + data.briefing.delayedHandovers.length },
    { type: "presidential_actions", count: data.presidentialActions.length },
    { type: "signatures", count: data.signatures.length },
    { type: "media_archive", count: data.mediaArchive.length },
    { type: "commands", count: data.commands.length }
  ];
  const context = {
    briefing: data.briefing,
    presidentialActions: data.presidentialActions.slice(0, 25),
    signatures: data.signatures.slice(0, 20),
    commands: data.commands.slice(0, 20),
    mediaArchive: data.mediaArchive.slice(0, 20)
  };
  let answer = executiveSecretaryFallback(prompt, data);
  let model = "local-fallback";
  let status = "COMPLETED";

  if (isAiTextConfigured()) {
    try {
      const generated = await generateAiText({
        openAiModel: process.env.OPENAI_EXECUTIVE_SECRETARY_MODEL ?? process.env.OPENAI_ASSISTANT_MODEL ?? "gpt-5-mini",
        anthropicModel: process.env.ANTHROPIC_EXECUTIVE_SECRETARY_MODEL ?? process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest",
        instructions: [
          "You are LETW's private AI Executive Secretary for the president and top pastors.",
          "Use only the supplied authorized JSON context. Do not invent hidden records.",
          "Produce concise executive briefings, action drafts, decision summaries, risk summaries, and follow-up recommendations.",
          "Never claim you changed records, sent messages, approved documents, or signed anything.",
          "Clearly mark suggestions that need human confirmation."
        ].join(" "),
        input: `REQUEST:\n${prompt}\n\nAUTHORIZED EXECUTIVE CONTEXT:\n${JSON.stringify(context, null, 2)}`,
        maxTokens: 2400
      });
      answer = generated.text;
      model = `${generated.provider}:${generated.model}`;
    } catch (error) {
      status = "FAILED_WITH_FALLBACK";
      model = "local-fallback";
    }
  }

  await prisma.aiAssistantAudit.create({
    data: {
      userId: actorId,
      mode: "EXECUTIVE_SECRETARY",
      question: prompt,
      workspaceIds: asJson(data.workspaces.map((workspace) => workspace.id)),
      sources: asJson(sources),
      model,
      status
    }
  });
  await logActivity({
    userId: actorId,
    action: activityActions.executiveSecretaryAsked,
    metadata: { prompt: prompt.slice(0, 200), model, status }
  });
  return { answer, sources, model };
}
