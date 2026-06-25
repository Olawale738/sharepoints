import {
  CommunicationSafetyCategory,
  CommunicationSafetyStatus,
  EmergencyIncidentStatus,
  FreshnessIssueStatus,
  FreshnessIssueType,
  GovernanceHoldStatus,
  MembershipCardStatus,
  OrganizationUnitType,
  SafeguardingCaseStatus,
  SafeguardingSeverity
} from "@prisma/client";
import { randomUUID } from "crypto";
import { z } from "zod";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { notifyUsers } from "@/lib/notifications";
import { getOrganizationScopeUserIds } from "@/lib/organization-access";
import { prisma } from "@/lib/prisma";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

const sourceTypes = ["announcement", "task", "knowledge", "meeting", "chat", "policy", "file"] as const;

const createSchema = z.discriminatedUnion("entity", [
  z.object({
    entity: z.literal("UNIT"),
    parentId: z.string().cuid().nullable().optional(),
    type: z.nativeEnum(OrganizationUnitType),
    name: z.string().trim().min(2).max(120),
    code: z.string().trim().max(40).nullable().optional(),
    countryCode: z.string().trim().length(2).nullable().optional(),
    description: z.string().trim().max(500).nullable().optional()
  }),
  z.object({
    entity: z.literal("LEADER"),
    unitId: z.string().cuid(),
    userId: z.string().cuid(),
    title: z.string().trim().min(2).max(100),
    canCreateWorkspaces: z.boolean().default(true),
    inheritToChildren: z.boolean().default(true)
  }),
  z.object({
    entity: z.literal("SAFEGUARDING"),
    organizationUnitId: z.string().cuid().nullable().optional(),
    workspaceId: z.string().cuid().nullable().optional(),
    subjectName: z.string().trim().min(2).max(120),
    subjectUserId: z.string().cuid().nullable().optional(),
    category: z.string().trim().min(2).max(100),
    summary: z.string().trim().min(5).max(10_000),
    privateNotes: z.string().trim().max(20_000).nullable().optional(),
    severity: z.nativeEnum(SafeguardingSeverity),
    assignedToId: z.string().cuid().nullable().optional(),
    nextReviewAt: z.string().datetime().nullable().optional()
  }),
  z.object({
    entity: z.literal("AI_AGENT"),
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(500).nullable().optional(),
    instructions: z.string().trim().min(10).max(8_000),
    workspaceId: z.string().cuid().nullable().optional(),
    organizationUnitId: z.string().cuid().nullable().optional(),
    allowedSourceTypes: z.array(z.enum(sourceTypes)).min(1)
  }),
  z.object({
    entity: z.literal("EMERGENCY"),
    organizationUnitId: z.string().cuid().nullable().optional(),
    workspaceId: z.string().cuid().nullable().optional(),
    title: z.string().trim().min(2).max(160),
    instructions: z.string().trim().min(5).max(5_000),
    severity: z.nativeEnum(SafeguardingSeverity),
    location: z.string().trim().max(180).nullable().optional(),
    activateNow: z.boolean().default(false)
  }),
  z.object({
    entity: z.literal("MEMBERSHIP_CARD"),
    userId: z.string().cuid(),
    expiresAt: z.string().datetime().nullable().optional()
  }),
  z.object({
    entity: z.literal("GOVERNANCE_HOLD"),
    name: z.string().trim().min(2).max(160),
    targetType: z.enum(["FILE", "WORKSPACE"]),
    targetId: z.string().cuid(),
    reason: z.string().trim().min(5).max(5_000),
    preserveUntil: z.string().datetime().nullable().optional()
  }),
  z.object({
    entity: z.literal("RESOURCE_PASS"),
    resourceId: z.string().cuid()
  }),
  z.object({ entity: z.literal("FRESHNESS_SCAN") }),
  z.object({ entity: z.literal("SAFETY_SCAN") })
]);

const updateSchema = z.discriminatedUnion("entity", [
  z.object({
    entity: z.literal("SAFEGUARDING"),
    id: z.string().cuid(),
    status: z.nativeEnum(SafeguardingCaseStatus),
    assignedToId: z.string().cuid().nullable().optional(),
    privateNotes: z.string().trim().max(20_000).nullable().optional()
  }),
  z.object({
    entity: z.literal("FRESHNESS"),
    id: z.string().cuid(),
    status: z.nativeEnum(FreshnessIssueStatus)
  }),
  z.object({
    entity: z.literal("SAFETY"),
    id: z.string().cuid(),
    status: z.nativeEnum(CommunicationSafetyStatus),
    resolutionNote: z.string().trim().max(5_000).nullable().optional()
  }),
  z.object({
    entity: z.literal("EMERGENCY"),
    id: z.string().cuid(),
    status: z.nativeEnum(EmergencyIncidentStatus)
  }),
  z.object({
    entity: z.literal("MEMBERSHIP_CARD"),
    id: z.string().cuid(),
    operation: z.enum(["REVOKE", "REISSUE", "DELETE"])
  }),
  z.object({
    entity: z.literal("GOVERNANCE_HOLD"),
    id: z.string().cuid(),
    status: z.literal(GovernanceHoldStatus.RELEASED)
  }),
  z.object({
    entity: z.literal("AI_AGENT"),
    id: z.string().cuid(),
    enabled: z.boolean()
  })
]);

async function emergencyRecipientIds(input: {
  organizationUnitId: string | null;
  workspaceId: string | null;
}) {
  if (input.workspaceId) {
    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: input.workspaceId },
      select: { userId: true }
    });
    return members.map((member) => member.userId);
  }
  if (input.organizationUnitId) {
    return getOrganizationScopeUserIds(input.organizationUnitId);
  }
  const users = await prisma.user.findMany({
    where: { deletedAt: null, suspendedAt: null, accessRevokedAt: null },
    select: { id: true }
  });
  return users.map((user) => user.id);
}

async function notifyEmergency(incident: {
  id: string;
  title: string;
  instructions: string;
  workspaceId: string | null;
  organizationUnitId: string | null;
  severity: SafeguardingSeverity;
}) {
  const userIds = await emergencyRecipientIds(incident);
  await notifyUsers(userIds, {
    workspaceId: incident.workspaceId,
    type: "EMERGENCY",
    title: incident.title,
    body: incident.instructions.slice(0, 500),
    href: "/dashboard/emergency",
    priority: "URGENT"
  });
}

function detectSafety(body: string) {
  const normalized = body.toLowerCase();
  const rules: Array<{
    category: CommunicationSafetyCategory;
    severity: SafeguardingSeverity;
    terms: string[];
  }> = [
    {
      category: CommunicationSafetyCategory.THREAT,
      severity: SafeguardingSeverity.CRITICAL,
      terms: ["i will kill", "going to hurt", "bomb threat", "attack them"]
    },
    {
      category: CommunicationSafetyCategory.SELF_HARM,
      severity: SafeguardingSeverity.CRITICAL,
      terms: ["kill myself", "end my life", "suicide"]
    },
    {
      category: CommunicationSafetyCategory.SAFEGUARDING,
      severity: SafeguardingSeverity.HIGH,
      terms: ["abused a child", "child abuse", "unsafe with children"]
    },
    {
      category: CommunicationSafetyCategory.CONFIDENTIAL_DATA,
      severity: SafeguardingSeverity.MEDIUM,
      terms: ["password is", "credit card", "bank account", "private key"]
    },
    {
      category: CommunicationSafetyCategory.HARASSMENT,
      severity: SafeguardingSeverity.MEDIUM,
      terms: ["hate you", "worthless", "harassing", "bullying"]
    }
  ];

  return rules.find((rule) => rule.terms.some((term) => normalized.includes(term))) ?? null;
}

async function runFreshnessScan() {
  const staleAt = new Date(Date.now() - 180 * 86_400_000);
  const policyReviewAt = new Date(Date.now() - 365 * 86_400_000);
  const [files, wikiPages, policies] = await Promise.all([
    prisma.file.findMany({
      where: { deletedAt: null },
      select: { id: true, workspaceId: true, fileName: true, uploadedById: true, updatedAt: true }
    }),
    prisma.wikiPage.findMany({
      where: { status: "PUBLISHED", updatedAt: { lt: staleAt } },
      select: { id: true, workspaceId: true, title: true, updatedById: true, updatedAt: true }
    }),
    prisma.policyDocument.findMany({
      where: { status: "PUBLISHED", updatedAt: { lt: policyReviewAt } },
      select: { id: true, workspaceId: true, title: true, createdById: true, updatedAt: true }
    })
  ]);
  const operations: ReturnType<typeof prisma.contentFreshnessIssue.upsert>[] = [];
  const duplicateGroups = new Map<string, typeof files>();

  for (const file of files) {
    if (file.updatedAt < staleAt) {
      operations.push(
        prisma.contentFreshnessIssue.upsert({
          where: {
            sourceType_sourceId_issueType: {
              sourceType: "FILE",
              sourceId: file.id,
              issueType: FreshnessIssueType.STALE
            }
          },
          update: {
            title: file.fileName,
            lastUpdatedAt: file.updatedAt,
            status: FreshnessIssueStatus.OPEN
          },
          create: {
            sourceType: "FILE",
            sourceId: file.id,
            workspaceId: file.workspaceId,
            issueType: FreshnessIssueType.STALE,
            title: file.fileName,
            details: "This document has not been updated in more than 180 days.",
            ownerId: file.uploadedById,
            lastUpdatedAt: file.updatedAt
          }
        })
      );
    }
    const duplicateKey = `${file.workspaceId}:${file.fileName.toLowerCase()}`;
    duplicateGroups.set(duplicateKey, [...(duplicateGroups.get(duplicateKey) ?? []), file]);
  }

  for (const duplicateFiles of duplicateGroups.values()) {
    if (duplicateFiles.length < 2) continue;
    for (const file of duplicateFiles) {
      operations.push(
        prisma.contentFreshnessIssue.upsert({
          where: {
            sourceType_sourceId_issueType: {
              sourceType: "FILE",
              sourceId: file.id,
              issueType: FreshnessIssueType.DUPLICATE
            }
          },
          update: { status: FreshnessIssueStatus.OPEN },
          create: {
            sourceType: "FILE",
            sourceId: file.id,
            workspaceId: file.workspaceId,
            issueType: FreshnessIssueType.DUPLICATE,
            title: file.fileName,
            details: "Another document in this workspace uses the same filename.",
            ownerId: file.uploadedById,
            lastUpdatedAt: file.updatedAt
          }
        })
      );
    }
  }

  for (const page of wikiPages) {
    operations.push(
      prisma.contentFreshnessIssue.upsert({
        where: {
          sourceType_sourceId_issueType: {
            sourceType: "WIKI",
            sourceId: page.id,
            issueType: FreshnessIssueType.STALE
          }
        },
        update: { status: FreshnessIssueStatus.OPEN, lastUpdatedAt: page.updatedAt },
        create: {
          sourceType: "WIKI",
          sourceId: page.id,
          workspaceId: page.workspaceId,
          issueType: FreshnessIssueType.STALE,
          title: page.title,
          details: "This knowledge page has not been reviewed in more than 180 days.",
          ownerId: page.updatedById,
          lastUpdatedAt: page.updatedAt
        }
      })
    );
  }

  for (const policy of policies) {
    operations.push(
      prisma.contentFreshnessIssue.upsert({
        where: {
          sourceType_sourceId_issueType: {
            sourceType: "POLICY",
            sourceId: policy.id,
            issueType: FreshnessIssueType.REVIEW_DUE
          }
        },
        update: { status: FreshnessIssueStatus.OPEN, lastUpdatedAt: policy.updatedAt },
        create: {
          sourceType: "POLICY",
          sourceId: policy.id,
          workspaceId: policy.workspaceId,
          issueType: FreshnessIssueType.REVIEW_DUE,
          title: policy.title,
          details: "This published policy is due for its annual review.",
          ownerId: policy.createdById,
          lastUpdatedAt: policy.updatedAt
        }
      })
    );
  }

  if (operations.length) await prisma.$transaction(operations);
  return operations.length;
}

async function runCommunicationSafetyScan() {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [workspaceMessages, organizationMessages] = await Promise.all([
    prisma.chatMessage.findMany({
      where: { deletedAt: null, createdAt: { gte: since } },
      select: { id: true, body: true, channel: { select: { workspaceId: true } } },
      take: 2_000
    }),
    prisma.orgChatMessage.findMany({
      where: { deletedAt: null, createdAt: { gte: since } },
      select: { id: true, body: true },
      take: 2_000
    })
  ]);
  const detections = [
    ...workspaceMessages.map((message) => ({
      sourceType: "WORKSPACE_CHAT",
      sourceId: message.id,
      workspaceId: message.channel.workspaceId,
      match: detectSafety(message.body)
    })),
    ...organizationMessages.map((message) => ({
      sourceType: "ORGANIZATION_CHAT",
      sourceId: message.id,
      workspaceId: null,
      match: detectSafety(message.body)
    }))
  ].filter((detection) => detection.match);

  if (detections.length) {
    await prisma.$transaction(
      detections.map((detection) =>
        prisma.communicationSafetyCase.upsert({
          where: {
            sourceType_sourceId_category: {
              sourceType: detection.sourceType,
              sourceId: detection.sourceId,
              category: detection.match!.category
            }
          },
          update: {},
          create: {
            sourceType: detection.sourceType,
            sourceId: detection.sourceId,
            workspaceId: detection.workspaceId,
            category: detection.match!.category,
            severity: detection.match!.severity,
            summary: `Potential ${detection.match!.category.toLowerCase().replaceAll("_", " ")} language detected. Message content is restricted to designated reviewers.`
          }
        })
      )
    );
  }
  return detections.length;
}

export async function GET() {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id);
    const [
      units,
      leaders,
      users,
      workspaces,
      safeguardingCases,
      aiAgents,
      freshnessIssues,
      safetyCases,
      emergencies,
      cards,
      holds,
      resources,
      resourcePasses,
      resourceCheckIns,
      identityVerifications
    ] = await Promise.all([
      prisma.organizationUnit.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }] }),
      prisma.organizationUnitLeader.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.user.findMany({
        where: { deletedAt: null },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          memberProfile: {
            select: {
              membershipNumber: true,
              membershipStartedAt: true,
              membershipStatus: true,
              organizationPosition: true,
              digitalIdLocation: true
            }
          }
        },
        orderBy: { name: "asc" }
      }),
      prisma.workspace.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, organizationUnitId: true, scopeType: true },
        orderBy: { name: "asc" }
      }),
      prisma.safeguardingCase.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200 }),
      prisma.workspaceAiAgent.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.contentFreshnessIssue.findMany({
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: 300
      }),
      prisma.communicationSafetyCase.findMany({
        orderBy: [{ status: "asc" }, { detectedAt: "desc" }],
        take: 300
      }),
      prisma.emergencyIncident.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.digitalMembershipCard.findMany({
        where: { deletedAt: null },
        orderBy: { issuedAt: "desc" },
        take: 500
      }),
      prisma.governanceHold.findMany({ orderBy: { createdAt: "desc" }, take: 300 }),
      prisma.churchResource.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.smartResourcePass.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.resourceCheckIn.findMany({ orderBy: { checkedInAt: "desc" }, take: 200 }),
      prisma.digitalIdentityVerification.findMany({ orderBy: { createdAt: "desc" }, take: 100 })
    ]);
    const responseCounts = await prisma.emergencyWelfareResponse.groupBy({
      by: ["incidentId", "status"],
      _count: { _all: true }
    });

    return ok({
      units,
      leaders,
      users,
      workspaces,
      safeguardingCases,
      aiAgents,
      freshnessIssues,
      safetyCases,
      emergencies,
      emergencyResponseCounts: responseCounts,
      cards,
      holds,
      resources,
      resourcePasses,
      resourceCheckIns,
      identityVerifications
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id);
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid operation.");
    const data = parsed.data;
    let result: unknown;
    let action = "";
    let targetId: string | undefined;

    if (data.entity === "UNIT") {
      if (data.parentId) {
        const parent = await prisma.organizationUnit.findUnique({ where: { id: data.parentId } });
        if (!parent) throw new ApiError(404, "Parent organization unit not found.");
      }
      result = await prisma.organizationUnit.create({
        data: {
          parentId: data.parentId ?? null,
          type: data.type,
          name: data.name,
          code: data.code || null,
          countryCode: data.countryCode?.toUpperCase() || null,
          description: data.description || null,
          createdById: user.id
        }
      });
      action = activityActions.organizationUnitCreated;
      targetId = (result as { id: string }).id;
    } else if (data.entity === "LEADER") {
      result = await prisma.organizationUnitLeader.upsert({
        where: {
          unitId_userId_title: {
            unitId: data.unitId,
            userId: data.userId,
            title: data.title
          }
        },
        update: {
          canCreateWorkspaces: data.canCreateWorkspaces,
          inheritToChildren: data.inheritToChildren,
          assignedById: user.id
        },
        create: {
          unitId: data.unitId,
          userId: data.userId,
          title: data.title,
          canCreateWorkspaces: data.canCreateWorkspaces,
          inheritToChildren: data.inheritToChildren,
          assignedById: user.id
        }
      });
      action = activityActions.organizationLeaderAssigned;
      targetId = (result as { id: string }).id;
    } else if (data.entity === "SAFEGUARDING") {
      result = await prisma.safeguardingCase.create({
        data: {
          reference: `SAFE-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`,
          organizationUnitId: data.organizationUnitId ?? null,
          workspaceId: data.workspaceId ?? null,
          subjectName: data.subjectName,
          subjectUserId: data.subjectUserId ?? null,
          category: data.category,
          summary: data.summary,
          privateNotes: data.privateNotes ?? null,
          severity: data.severity,
          assignedToId: data.assignedToId ?? null,
          reportedById: user.id,
          nextReviewAt: data.nextReviewAt ? new Date(data.nextReviewAt) : null
        }
      });
      action = activityActions.safeguardingCaseCreated;
      targetId = (result as { id: string }).id;
    } else if (data.entity === "AI_AGENT") {
      result = await prisma.workspaceAiAgent.create({
        data: {
          name: data.name,
          description: data.description ?? null,
          instructions: data.instructions,
          workspaceId: data.workspaceId ?? null,
          organizationUnitId: data.organizationUnitId ?? null,
          allowedSourceTypes: data.allowedSourceTypes,
          createdById: user.id
        }
      });
      action = activityActions.aiAgentCreated;
      targetId = (result as { id: string }).id;
    } else if (data.entity === "EMERGENCY") {
      result = await prisma.emergencyIncident.create({
        data: {
          organizationUnitId: data.organizationUnitId ?? null,
          workspaceId: data.workspaceId ?? null,
          title: data.title,
          instructions: data.instructions,
          severity: data.severity,
          location: data.location ?? null,
          status: data.activateNow ? EmergencyIncidentStatus.ACTIVE : EmergencyIncidentStatus.DRAFT,
          activatedAt: data.activateNow ? new Date() : null,
          createdById: user.id
        }
      });
      if (data.activateNow) await notifyEmergency(result as never);
      action = activityActions.emergencyCreated;
      targetId = (result as { id: string }).id;
    } else if (data.entity === "MEMBERSHIP_CARD") {
      const issuedAt = new Date();
      result = await prisma.digitalMembershipCard.upsert({
        where: { userId: data.userId },
        update: {
          status: MembershipCardStatus.ACTIVE,
          qrToken: randomUUID(),
          issuedAt,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
          revokedAt: null,
          revokedById: null,
          deletedAt: null,
          deletedById: null,
          issuedById: user.id
        },
        create: {
          userId: data.userId,
          qrToken: randomUUID(),
          cardNumber: `LETW-${new Date().getUTCFullYear()}-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`,
          organizationId: `LETW.ORG-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`,
          issuedAt,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
          issuedById: user.id
        }
      });
      action = activityActions.membershipCardIssued;
      targetId = (result as { id: string }).id;
    } else if (data.entity === "GOVERNANCE_HOLD") {
      if (data.targetType === "FILE") {
        const file = await prisma.file.findUnique({ where: { id: data.targetId } });
        if (!file) throw new ApiError(404, "Document not found.");
        await prisma.file.update({
          where: { id: file.id },
          data: {
            legalHold: true,
            retentionUntil: data.preserveUntil ? new Date(data.preserveUntil) : file.retentionUntil
          }
        });
      } else {
        const workspace = await prisma.workspace.findUnique({ where: { id: data.targetId } });
        if (!workspace) throw new ApiError(404, "Workspace not found.");
      }
      result = await prisma.governanceHold.create({
        data: {
          name: data.name,
          targetType: data.targetType,
          targetId: data.targetId,
          workspaceId: data.targetType === "WORKSPACE" ? data.targetId : null,
          reason: data.reason,
          preserveUntil: data.preserveUntil ? new Date(data.preserveUntil) : null,
          createdById: user.id
        }
      });
      action = activityActions.governanceHoldCreated;
      targetId = (result as { id: string }).id;
    } else if (data.entity === "RESOURCE_PASS") {
      result = await prisma.smartResourcePass.upsert({
        where: { resourceId: data.resourceId },
        update: { enabled: true },
        create: {
          resourceId: data.resourceId,
          qrToken: randomUUID(),
          createdById: user.id
        }
      });
      action = activityActions.resourcePassCreated;
      targetId = (result as { id: string }).id;
    } else if (data.entity === "FRESHNESS_SCAN") {
      result = { issuesDetected: await runFreshnessScan() };
      action = activityActions.contentFreshnessScanRun;
    } else {
      result = { casesDetected: await runCommunicationSafetyScan() };
      action = activityActions.communicationSafetyScanRun;
    }

    await logActivity({
      userId: user.id,
      action,
      targetId,
      metadata: { entity: data.entity }
    });
    return ok({ result }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id);
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid update.");
    const data = parsed.data;
    let result: unknown;
    let action = "";

    if (data.entity === "SAFEGUARDING") {
      result = await prisma.safeguardingCase.update({
        where: { id: data.id },
        data: {
          status: data.status,
          assignedToId: data.assignedToId,
          privateNotes: data.privateNotes,
          reviewerId: user.id,
          closedAt: data.status === SafeguardingCaseStatus.CLOSED ? new Date() : null
        }
      });
      action = activityActions.safeguardingCaseUpdated;
    } else if (data.entity === "FRESHNESS") {
      result = await prisma.contentFreshnessIssue.update({
        where: { id: data.id },
        data: { status: data.status, reviewedById: user.id, reviewedAt: new Date() }
      });
      action = activityActions.contentFreshnessScanRun;
    } else if (data.entity === "SAFETY") {
      result = await prisma.communicationSafetyCase.update({
        where: { id: data.id },
        data: {
          status: data.status,
          resolutionNote: data.resolutionNote,
          reviewerId: user.id,
          reviewedAt: new Date()
        }
      });
      action = activityActions.communicationSafetyScanRun;
    } else if (data.entity === "EMERGENCY") {
      result = await prisma.emergencyIncident.update({
        where: { id: data.id },
        data: {
          status: data.status,
          activatedAt: data.status === EmergencyIncidentStatus.ACTIVE ? new Date() : undefined,
          resolvedAt: data.status === EmergencyIncidentStatus.RESOLVED ? new Date() : null
        }
      });
      if (data.status === EmergencyIncidentStatus.ACTIVE) await notifyEmergency(result as never);
      action = activityActions.emergencyUpdated;
    } else if (data.entity === "MEMBERSHIP_CARD") {
      const card = await prisma.digitalMembershipCard.findFirst({
        where: { id: data.id, deletedAt: null }
      });
      if (!card) throw new ApiError(404, "Digital membership card not found.");

      if (data.operation === "REVOKE") {
        result = await prisma.digitalMembershipCard.update({
          where: { id: card.id },
          data: {
            status: MembershipCardStatus.REVOKED,
            revokedAt: new Date(),
            revokedById: user.id
          }
        });
        action = activityActions.membershipCardRevoked;
      } else if (data.operation === "REISSUE") {
        result = await prisma.digitalMembershipCard.update({
          where: { id: card.id },
          data: {
            status: MembershipCardStatus.ACTIVE,
            qrToken: randomUUID(),
            issuedAt: new Date(),
            revokedAt: null,
            revokedById: null
          }
        });
        action = activityActions.membershipCardReissued;
      } else {
        if (card.status !== MembershipCardStatus.REVOKED) {
          throw new ApiError(409, "Revoke this Digital ID before deleting it.");
        }
        result = await prisma.$transaction(async (tx) => {
          await tx.digitalIdentityVerification.deleteMany({ where: { cardId: card.id } });
          return tx.digitalMembershipCard.update({
            where: { id: card.id },
            data: {
              deletedAt: new Date(),
              deletedById: user.id
            }
          });
        });
        action = activityActions.membershipCardDeleted;
      }
    } else if (data.entity === "AI_AGENT") {
      result = await prisma.workspaceAiAgent.update({
        where: { id: data.id },
        data: { enabled: data.enabled }
      });
      action = activityActions.aiAgentUpdated;
    } else {
      const hold = await prisma.governanceHold.update({
        where: { id: data.id },
        data: {
          status: GovernanceHoldStatus.RELEASED,
          releasedById: user.id,
          releasedAt: new Date()
        }
      });
      const otherActiveHolds = await prisma.governanceHold.count({
        where: {
          id: { not: hold.id },
          targetType: hold.targetType,
          targetId: hold.targetId,
          status: GovernanceHoldStatus.ACTIVE
        }
      });
      if (!otherActiveHolds) {
        if (hold.targetType === "FILE") {
          await prisma.file.update({ where: { id: hold.targetId }, data: { legalHold: false } });
        }
      }
      result = hold;
      action = activityActions.governanceHoldReleased;
    }

    await logActivity({
      userId: user.id,
      action,
      targetId: data.id,
      metadata: { entity: data.entity }
    });
    return ok({ result });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id);
    const body = (await request.json().catch(() => null)) as
      | { entity?: string; confirmation?: string }
      | null;
    if (
      body?.entity !== "IDENTITY_VERIFICATIONS" ||
      body.confirmation !== "CLEAR QR VERIFICATION LOG"
    ) {
      throw new ApiError(422, "Enter the required QR verification confirmation phrase.");
    }
    const cleared = await prisma.digitalIdentityVerification.deleteMany({});
    await logActivity({
      userId: user.id,
      action: activityActions.membershipVerificationLogsCleared,
      metadata: { clearedCount: cleared.count }
    });
    return ok({ cleared: true, count: cleared.count });
  } catch (error) {
    return handleRouteError(error);
  }
}
