import { randomBytes } from "crypto";
import { WorkspaceRole } from "@prisma/client";
import { z } from "zod";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole, requireAnyWorkspaceAdmin, requireWorkspaceMembership } from "@/lib/rbac";

const optionalCuid = z.string().cuid().nullable().optional();
const optionalDate = z.string().datetime().nullable().optional();

const createSchema = z.discriminatedUnion("entity", [
  z.object({
    entity: z.literal("TRAINING_PROGRAM"),
    workspaceId: optionalCuid,
    organizationUnitId: optionalCuid,
    title: z.string().trim().min(2).max(180),
    description: z.string().trim().max(5000).nullable().optional(),
    category: z.string().trim().min(2).max(100),
    level: z.string().trim().min(2).max(80).default("Foundation"),
    requiredRole: z.string().trim().max(80).nullable().optional(),
    durationMinutes: z.coerce.number().int().min(1).max(100000).nullable().optional()
  }),
  z.object({
    entity: z.literal("TRAINING_ENROLLMENT"),
    programId: z.string().cuid(),
    userId: z.string().cuid(),
    dueAt: optionalDate
  }),
  z.object({
    entity: z.literal("PRAYER_REQUEST"),
    workspaceId: optionalCuid,
    organizationUnitId: optionalCuid,
    title: z.string().trim().min(2).max(180),
    details: z.string().trim().min(5).max(10000),
    visibility: z.enum(["PRIVATE", "PASTORAL", "WORKSPACE"]).default("PASTORAL"),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
    assignedToId: optionalCuid
  }),
  z.object({
    entity: z.literal("PRAYER_NOTE"),
    prayerRequestId: z.string().cuid(),
    body: z.string().trim().min(2).max(10000)
  }),
  z.object({
    entity: z.literal("ASSET_MAINTENANCE"),
    resourceId: optionalCuid,
    workspaceId: optionalCuid,
    organizationUnitId: optionalCuid,
    title: z.string().trim().min(2).max(180),
    category: z.string().trim().min(2).max(100),
    issue: z.string().trim().min(5).max(10000),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
    assignedToId: optionalCuid,
    dueAt: optionalDate
  }),
  z.object({
    entity: z.literal("MINISTRY_CAMPAIGN"),
    workspaceId: optionalCuid,
    organizationUnitId: optionalCuid,
    ministryId: optionalCuid,
    title: z.string().trim().min(2).max(180),
    campaignType: z.string().trim().min(2).max(100),
    objective: z.string().trim().min(5).max(10000),
    targetAudience: z.string().trim().max(180).nullable().optional(),
    goalCount: z.coerce.number().int().min(0).nullable().optional(),
    budgetAmount: z.coerce.number().int().min(0).nullable().optional(),
    budgetCurrency: z.string().trim().min(3).max(3).default("GBP"),
    ownerId: optionalCuid,
    startsAt: optionalDate,
    endsAt: optionalDate
  }),
  z.object({
    entity: z.literal("CAMPAIGN_UPDATE"),
    campaignId: z.string().cuid(),
    body: z.string().trim().min(2).max(10000),
    progressCount: z.coerce.number().int().min(0).nullable().optional()
  }),
  z.object({
    entity: z.literal("SERMON_RESOURCE"),
    workspaceId: optionalCuid,
    organizationUnitId: optionalCuid,
    title: z.string().trim().min(2).max(180),
    speaker: z.string().trim().min(2).max(160),
    scripture: z.string().trim().max(180).nullable().optional(),
    language: z.string().trim().min(2).max(12).default("en"),
    mediaUrl: z.string().url().nullable().optional(),
    notes: z.string().trim().max(10000).nullable().optional(),
    visibility: z.enum(["PRIVATE", "LEADERSHIP", "MEMBERS", "PUBLIC"]).default("MEMBERS"),
    tags: z
      .string()
      .trim()
      .max(500)
      .nullable()
      .optional()
      .transform((value) => value?.split(",").map((tag) => tag.trim()).filter(Boolean) ?? [])
  })
]);

const updateSchema = z.discriminatedUnion("entity", [
  z.object({
    entity: z.literal("TRAINING_ENROLLMENT"),
    id: z.string().cuid(),
    status: z.enum(["ASSIGNED", "IN_PROGRESS", "COMPLETED", "EXPIRED", "REVOKED"]).optional(),
    progress: z.coerce.number().int().min(0).max(100).optional()
  }),
  z.object({
    entity: z.literal("PRAYER_REQUEST"),
    id: z.string().cuid(),
    status: z.enum(["OPEN", "ASSIGNED", "PRAYED_FOR", "FOLLOW_UP", "CLOSED"]).optional(),
    assignedToId: optionalCuid,
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional()
  }),
  z.object({
    entity: z.literal("ASSET_MAINTENANCE"),
    id: z.string().cuid(),
    status: z.enum(["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"]).optional(),
    assignedToId: optionalCuid,
    dueAt: optionalDate
  }),
  z.object({
    entity: z.literal("MINISTRY_CAMPAIGN"),
    id: z.string().cuid(),
    status: z.enum(["DRAFT", "ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"]).optional(),
    currentCount: z.coerce.number().int().min(0).optional()
  }),
  z.object({
    entity: z.literal("TRAINING_PROGRAM"),
    id: z.string().cuid(),
    status: z.enum(["ACTIVE", "ARCHIVED"])
  })
]);

const deleteSchema = z.discriminatedUnion("entity", [
  z.object({ entity: z.literal("TRAINING_PROGRAM"), id: z.string().cuid() }),
  z.object({ entity: z.literal("TRAINING_ENROLLMENT"), id: z.string().cuid() }),
  z.object({ entity: z.literal("PRAYER_REQUEST"), id: z.string().cuid() }),
  z.object({ entity: z.literal("ASSET_MAINTENANCE"), id: z.string().cuid() }),
  z.object({ entity: z.literal("MINISTRY_CAMPAIGN"), id: z.string().cuid() }),
  z.object({ entity: z.literal("SERMON_RESOURCE"), id: z.string().cuid() }),
  z.object({ entity: z.literal("CLEAR_GROWTH_LOGS"), confirmation: z.literal("CLEAR GROWTH LOGS") })
]);

const growthActivityActions = [
  activityActions.trainingProgramCreated,
  activityActions.trainingEnrollmentCreated,
  activityActions.trainingEnrollmentUpdated,
  activityActions.prayerRequestCreated,
  activityActions.prayerRequestUpdated,
  activityActions.prayerNoteCreated,
  activityActions.assetMaintenanceCreated,
  activityActions.assetMaintenanceUpdated,
  activityActions.ministryCampaignCreated,
  activityActions.ministryCampaignUpdated,
  activityActions.campaignUpdateCreated,
  activityActions.sermonResourceCreated,
  activityActions.growthRecordDeleted,
  activityActions.growthLogsCleared
];

function dateOrNull(value?: string | null) {
  return value ? new Date(value) : null;
}

function certificateNumber() {
  return `LETW-CERT-${new Date().getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

async function workspaceIdsForUser(userId: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: {
      userId,
      workspace: {
        deletedAt: null
      }
    },
    select: {
      workspaceId: true
    }
  });
  return memberships.map((membership) => membership.workspaceId);
}

async function ensureWorkspaceAccess(userId: string, workspaceId?: string | null) {
  if (workspaceId) {
    await requireWorkspaceMembership(userId, workspaceId);
  }
}

export async function GET() {
  try {
    const user = await requireUser();
    const isAdmin = await hasAnyWorkspaceAdminRole(user.id);
    const workspaceIds = await workspaceIdsForUser(user.id);
    const workspaceScope = [{ workspaceId: null }, { workspaceId: { in: workspaceIds } }];
    const leadershipAccess = isAdmin
      ? true
      : Boolean(
          (await prisma.workspaceMember.findFirst({
            where: {
              userId: user.id,
              role: { in: [WorkspaceRole.ADMIN, WorkspaceRole.LEADER, WorkspaceRole.MODERATOR] },
              workspace: { deletedAt: null }
            },
            select: { id: true }
          })) ||
            (await prisma.organizationUnitLeader.findFirst({
              where: { userId: user.id },
              select: { id: true }
            }))
        );
    const visiblePrayerWhere = isAdmin
      ? {}
      : {
          OR: [
            { createdById: user.id },
            { assignedToId: user.id },
            { visibility: "WORKSPACE" as const, workspaceId: { in: workspaceIds } },
            ...(leadershipAccess ? [{ visibility: "PASTORAL" as const }] : [])
          ]
        };

    const [
      programs,
      enrollments,
      prayerRequests,
      prayerNotes,
      maintenanceTickets,
      campaigns,
      campaignUpdates,
      sermonResources,
      users,
      workspaces,
      units,
      ministries,
      resources
    ] = await Promise.all([
      prisma.trainingProgram.findMany({
        where: isAdmin ? {} : { status: "ACTIVE", OR: workspaceScope },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: 200
      }),
      prisma.trainingEnrollment.findMany({
        where: isAdmin ? {} : { userId: user.id },
        orderBy: [{ status: "asc" }, { dueAt: "asc" }],
        take: 400
      }),
      prisma.prayerRequest.findMany({
        where: visiblePrayerWhere,
        orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
        take: 250
      }),
      prisma.prayerRequestNote.findMany({
        where: isAdmin
          ? {}
          : {
              prayerRequestId: {
                in: (
                  await prisma.prayerRequest.findMany({
                    where: visiblePrayerWhere,
                    select: { id: true }
                  })
                ).map((request) => request.id)
              }
            },
        orderBy: { createdAt: "desc" },
        take: 300
      }),
      prisma.assetMaintenanceTicket.findMany({
        where: isAdmin ? {} : { OR: [{ createdById: user.id }, { assignedToId: user.id }, ...workspaceScope] },
        orderBy: [{ status: "asc" }, { priority: "desc" }, { createdAt: "desc" }],
        take: 250
      }),
      prisma.ministryCampaign.findMany({
        where: isAdmin ? {} : { status: { in: ["ACTIVE", "COMPLETED"] }, OR: workspaceScope },
        orderBy: [{ status: "asc" }, { startsAt: "desc" }],
        take: 200
      }),
      prisma.campaignUpdate.findMany({
        where: isAdmin
          ? {}
          : {
              campaignId: {
                in: (
                  await prisma.ministryCampaign.findMany({
                    where: { status: { in: ["ACTIVE", "COMPLETED"] }, OR: workspaceScope },
                    select: { id: true }
                  })
                ).map((campaign) => campaign.id)
              }
            },
        orderBy: { createdAt: "desc" },
        take: 300
      }),
      prisma.sermonResource.findMany({
        where: isAdmin ? {} : { visibility: { in: ["MEMBERS", "PUBLIC"] }, OR: workspaceScope },
        orderBy: { createdAt: "desc" },
        take: 200
      }),
      prisma.user.findMany({
        where: isAdmin
          ? { deletedAt: null, suspendedAt: null, accessRevokedAt: null }
          : { id: user.id, deletedAt: null, suspendedAt: null, accessRevokedAt: null },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
        take: 1000
      }),
      prisma.workspace.findMany({
        where: isAdmin ? { deletedAt: null } : { id: { in: workspaceIds }, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      }),
      prisma.organizationUnit.findMany({
        where: { active: true },
        select: { id: true, name: true, type: true },
        orderBy: [{ type: "asc" }, { name: "asc" }]
      }),
      prisma.ministry.findMany({ orderBy: { name: "asc" } }),
      prisma.churchResource.findMany({ where: { active: true }, orderBy: { name: "asc" } })
    ]);

    return ok({
      isAdmin,
      programs,
      enrollments,
      prayerRequests,
      prayerNotes,
      maintenanceTickets,
      campaigns,
      campaignUpdates,
      sermonResources,
      users,
      workspaces,
      units,
      ministries,
      resources
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const isAdmin = await hasAnyWorkspaceAdminRole(user.id);
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid growth request.");
    const data = parsed.data;
    let result: unknown;
    let action = "";

    if (data.entity === "TRAINING_PROGRAM") {
      await requireAnyWorkspaceAdmin(user.id, "Only administrators can create training programs.");
      result = await prisma.trainingProgram.create({
        data: {
          workspaceId: data.workspaceId ?? null,
          organizationUnitId: data.organizationUnitId ?? null,
          title: data.title,
          description: data.description ?? null,
          category: data.category,
          level: data.level,
          requiredRole: data.requiredRole ?? null,
          durationMinutes: data.durationMinutes ?? null,
          createdById: user.id
        }
      });
      action = activityActions.trainingProgramCreated;
    } else if (data.entity === "TRAINING_ENROLLMENT") {
      await requireAnyWorkspaceAdmin(user.id, "Only administrators can assign training.");
      result = await prisma.trainingEnrollment.upsert({
        where: { programId_userId: { programId: data.programId, userId: data.userId } },
        update: { dueAt: dateOrNull(data.dueAt), assignedById: user.id },
        create: {
          programId: data.programId,
          userId: data.userId,
          dueAt: dateOrNull(data.dueAt),
          assignedById: user.id
        }
      });
      action = activityActions.trainingEnrollmentCreated;
    } else if (data.entity === "PRAYER_REQUEST") {
      await ensureWorkspaceAccess(user.id, data.workspaceId);
      if (!isAdmin && data.assignedToId) {
        throw new ApiError(403, "Only administrators can assign prayer requests.");
      }
      result = await prisma.prayerRequest.create({
        data: {
          workspaceId: data.workspaceId ?? null,
          organizationUnitId: data.organizationUnitId ?? null,
          title: data.title,
          details: data.details,
          visibility: data.visibility,
          priority: data.priority,
          createdById: user.id,
          assignedToId: isAdmin ? data.assignedToId ?? null : null
        }
      });
      action = activityActions.prayerRequestCreated;
    } else if (data.entity === "PRAYER_NOTE") {
      const requestRecord = await prisma.prayerRequest.findUnique({ where: { id: data.prayerRequestId } });
      if (!requestRecord) throw new ApiError(404, "Prayer request not found.");
      if (!isAdmin && requestRecord.createdById !== user.id && requestRecord.assignedToId !== user.id) {
        throw new ApiError(403, "You cannot add a note to this prayer request.");
      }
      result = await prisma.prayerRequestNote.create({
        data: {
          prayerRequestId: data.prayerRequestId,
          authorId: user.id,
          body: data.body
        }
      });
      action = activityActions.prayerNoteCreated;
    } else if (data.entity === "ASSET_MAINTENANCE") {
      await ensureWorkspaceAccess(user.id, data.workspaceId);
      result = await prisma.assetMaintenanceTicket.create({
        data: {
          resourceId: data.resourceId ?? null,
          workspaceId: data.workspaceId ?? null,
          organizationUnitId: data.organizationUnitId ?? null,
          title: data.title,
          category: data.category,
          issue: data.issue,
          priority: data.priority,
          assignedToId: isAdmin ? data.assignedToId ?? null : null,
          dueAt: dateOrNull(data.dueAt),
          createdById: user.id
        }
      });
      action = activityActions.assetMaintenanceCreated;
    } else if (data.entity === "MINISTRY_CAMPAIGN") {
      await requireAnyWorkspaceAdmin(user.id, "Only administrators can create campaigns.");
      result = await prisma.ministryCampaign.create({
        data: {
          workspaceId: data.workspaceId ?? null,
          organizationUnitId: data.organizationUnitId ?? null,
          ministryId: data.ministryId ?? null,
          title: data.title,
          campaignType: data.campaignType,
          objective: data.objective,
          targetAudience: data.targetAudience ?? null,
          goalCount: data.goalCount ?? null,
          budgetAmount: data.budgetAmount ?? null,
          budgetCurrency: data.budgetCurrency.toUpperCase(),
          ownerId: data.ownerId ?? null,
          startsAt: dateOrNull(data.startsAt),
          endsAt: dateOrNull(data.endsAt),
          createdById: user.id
        }
      });
      action = activityActions.ministryCampaignCreated;
    } else if (data.entity === "CAMPAIGN_UPDATE") {
      const campaign = await prisma.ministryCampaign.findUnique({ where: { id: data.campaignId } });
      if (!campaign) throw new ApiError(404, "Campaign not found.");
      if (!isAdmin && campaign.ownerId !== user.id) {
        throw new ApiError(403, "Only administrators and campaign owners can post campaign updates.");
      }
      result = await prisma.$transaction(async (tx) => {
        const update = await tx.campaignUpdate.create({
          data: {
            campaignId: data.campaignId,
            authorId: user.id,
            body: data.body,
            progressCount: data.progressCount ?? null
          }
        });
        if (typeof data.progressCount === "number") {
          await tx.ministryCampaign.update({
            where: { id: data.campaignId },
            data: { currentCount: data.progressCount }
          });
        }
        return update;
      });
      action = activityActions.campaignUpdateCreated;
    } else {
      await requireAnyWorkspaceAdmin(user.id, "Only administrators can add sermon resources.");
      result = await prisma.sermonResource.create({
        data: {
          workspaceId: data.workspaceId ?? null,
          organizationUnitId: data.organizationUnitId ?? null,
          title: data.title,
          speaker: data.speaker,
          scripture: data.scripture ?? null,
          language: data.language.toLowerCase(),
          mediaUrl: data.mediaUrl ?? null,
          notes: data.notes ?? null,
          visibility: data.visibility,
          tags: data.tags,
          createdById: user.id
        }
      });
      action = activityActions.sermonResourceCreated;
    }

    await logActivity({
      userId: user.id,
      action,
      targetId: (result as { id?: string } | null)?.id,
      metadata: { entity: data.entity, area: "growth" }
    });
    return ok({ result }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id, "Only administrators can update growth records.");
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid update.");
    const data = parsed.data;
    let result: unknown;
    let action = "";

    if (data.entity === "TRAINING_ENROLLMENT") {
      const status = data.status;
      const completed = status === "COMPLETED";
      result = await prisma.trainingEnrollment.update({
        where: { id: data.id },
        data: {
          status,
          progress: data.progress,
          completedAt: completed ? new Date() : undefined,
          certifiedAt: completed ? new Date() : undefined,
          certificateNumber: completed ? certificateNumber() : undefined
        }
      });
      action = activityActions.trainingEnrollmentUpdated;
    } else if (data.entity === "PRAYER_REQUEST") {
      result = await prisma.prayerRequest.update({
        where: { id: data.id },
        data: {
          status: data.status,
          priority: data.priority,
          assignedToId: data.assignedToId ?? undefined,
          prayedAt: data.status === "PRAYED_FOR" ? new Date() : undefined,
          closedAt: data.status === "CLOSED" ? new Date() : undefined
        }
      });
      action = activityActions.prayerRequestUpdated;
    } else if (data.entity === "ASSET_MAINTENANCE") {
      result = await prisma.assetMaintenanceTicket.update({
        where: { id: data.id },
        data: {
          status: data.status,
          assignedToId: data.assignedToId ?? undefined,
          dueAt: dateOrNull(data.dueAt),
          completedAt: data.status === "RESOLVED" || data.status === "CLOSED" ? new Date() : undefined
        }
      });
      action = activityActions.assetMaintenanceUpdated;
    } else if (data.entity === "MINISTRY_CAMPAIGN") {
      result = await prisma.ministryCampaign.update({
        where: { id: data.id },
        data: {
          status: data.status,
          currentCount: data.currentCount
        }
      });
      action = activityActions.ministryCampaignUpdated;
    } else {
      result = await prisma.trainingProgram.update({
        where: { id: data.id },
        data: { status: data.status }
      });
      action = activityActions.trainingProgramCreated;
    }

    await logActivity({ userId: user.id, action, targetId: data.id, metadata: { entity: data.entity, area: "growth" } });
    return ok({ result });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id, "Only administrators can delete growth records.");
    const parsed = deleteSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid delete request.");
    const data = parsed.data;

    if (data.entity === "CLEAR_GROWTH_LOGS") {
      const cleared = await prisma.activityLog.deleteMany({ where: { action: { in: growthActivityActions } } });
      await logActivity({
        userId: user.id,
        action: activityActions.growthLogsCleared,
        metadata: { area: "growth", clearedCount: cleared.count }
      });
      return ok({ cleared: true, count: cleared.count });
    }

    let cleanup: Record<string, number> = {};
    if (data.entity === "TRAINING_PROGRAM") {
      cleanup = await prisma.$transaction(async (tx) => {
        const enrollments = await tx.trainingEnrollment.deleteMany({ where: { programId: data.id } });
        await tx.trainingProgram.delete({ where: { id: data.id } });
        return { enrollmentsDeleted: enrollments.count };
      });
    } else if (data.entity === "TRAINING_ENROLLMENT") {
      await prisma.trainingEnrollment.delete({ where: { id: data.id } });
    } else if (data.entity === "PRAYER_REQUEST") {
      cleanup = await prisma.$transaction(async (tx) => {
        const notes = await tx.prayerRequestNote.deleteMany({ where: { prayerRequestId: data.id } });
        await tx.prayerRequest.delete({ where: { id: data.id } });
        return { notesDeleted: notes.count };
      });
    } else if (data.entity === "ASSET_MAINTENANCE") {
      await prisma.assetMaintenanceTicket.delete({ where: { id: data.id } });
    } else if (data.entity === "MINISTRY_CAMPAIGN") {
      cleanup = await prisma.$transaction(async (tx) => {
        const updates = await tx.campaignUpdate.deleteMany({ where: { campaignId: data.id } });
        await tx.ministryCampaign.delete({ where: { id: data.id } });
        return { updatesDeleted: updates.count };
      });
    } else {
      await prisma.sermonResource.delete({ where: { id: data.id } });
    }

    await logActivity({
      userId: user.id,
      action: activityActions.growthRecordDeleted,
      targetId: data.id,
      metadata: { entity: data.entity, area: "growth", ...cleanup }
    });
    return ok({ deleted: true, entity: data.entity, id: data.id, cleanup });
  } catch (error) {
    return handleRouteError(error);
  }
}
