import { z } from "zod";
import { randomUUID } from "crypto";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

const operationSchema = z.discriminatedUnion("entity", [
  z.object({
    entity: z.literal("MINISTRY"),
    name: z.string().trim().min(2).max(120),
    description: z.string().trim().max(500).optional(),
    leaderId: z.string().cuid().optional().nullable(),
    workspaceId: z.string().cuid().optional().nullable()
  }),
  z.object({
    entity: z.literal("EVENT"),
    title: z.string().trim().min(2).max(160),
    description: z.string().trim().max(1000).optional(),
    eventType: z.enum(["SERVICE", "EVENT", "OUTREACH", "MEETING", "TRAINING"]),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    location: z.string().trim().max(160).optional(),
    ministryId: z.string().cuid().optional().nullable(),
    workspaceId: z.string().cuid().optional().nullable()
  }),
  z.object({
    entity: z.literal("ATTENDANCE"),
    eventId: z.string().cuid(),
    userId: z.string().cuid().optional().nullable(),
    displayName: z.string().trim().min(2).max(120),
    email: z.string().email().optional().nullable()
  }),
  z.object({
    entity: z.literal("VOLUNTEER"),
    eventId: z.string().cuid(),
    ministryId: z.string().cuid().optional().nullable(),
    userId: z.string().cuid(),
    role: z.string().trim().min(2).max(120)
  }),
  z.object({
    entity: z.literal("FOLLOW_UP"),
    personName: z.string().trim().min(2).max(120),
    reason: z.string().trim().min(2).max(500),
    email: z.string().email().optional().nullable(),
    phone: z.string().trim().max(40).optional().nullable(),
    assignedToId: z.string().cuid().optional().nullable(),
    workspaceId: z.string().cuid().optional().nullable(),
    nextContactAt: z.string().datetime().optional().nullable()
  }),
  z.object({
    entity: z.literal("RESOURCE"),
    name: z.string().trim().min(2).max(120),
    category: z.string().trim().min(2).max(80),
    location: z.string().trim().max(160).optional().nullable(),
    description: z.string().trim().max(500).optional().nullable()
  }),
  z.object({
    entity: z.literal("BOOKING"),
    resourceId: z.string().cuid(),
    workspaceId: z.string().cuid().optional().nullable(),
    eventId: z.string().cuid().optional().nullable(),
    title: z.string().trim().min(2).max(160),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime()
  }),
  z.object({
    entity: z.literal("PROJECT"),
    name: z.string().trim().min(2).max(160),
    description: z.string().trim().max(5000).optional().nullable(),
    projectType: z.enum(["BUILDING", "MISSION", "OUTREACH", "CRUSADE", "ADMINISTRATIVE", "OTHER"]),
    workspaceId: z.string().cuid().optional().nullable(),
    organizationUnitId: z.string().cuid().optional().nullable(),
    ministryId: z.string().cuid().optional().nullable(),
    ownerId: z.string().cuid().optional().nullable(),
    budgetAmount: z.coerce.number().int().min(0).optional().nullable(),
    budgetCurrency: z.string().trim().min(3).max(3).optional(),
    startsAt: z.string().datetime().optional().nullable(),
    dueAt: z.string().datetime().optional().nullable()
  }),
  z.object({
    entity: z.literal("PROJECT_TASK"),
    projectId: z.string().cuid(),
    title: z.string().trim().min(2).max(180),
    description: z.string().trim().max(1000).optional().nullable(),
    assignedToId: z.string().cuid().optional().nullable(),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
    dueDate: z.string().datetime().optional().nullable()
  }),
  z.object({
    entity: z.literal("PROJECT_BUDGET"),
    projectId: z.string().cuid(),
    title: z.string().trim().min(2).max(180),
    category: z.string().trim().max(80).optional().nullable(),
    amount: z.coerce.number().int().min(1),
    currency: z.string().trim().min(3).max(3).default("GBP"),
    notes: z.string().trim().max(1000).optional().nullable()
  }),
  z.object({
    entity: z.literal("COUNSELLING_CASE"),
    subjectName: z.string().trim().min(2).max(160),
    category: z.string().trim().min(2).max(120),
    summary: z.string().trim().min(5).max(10000),
    subjectUserId: z.string().cuid().optional().nullable(),
    assignedToId: z.string().cuid().optional().nullable(),
    workspaceId: z.string().cuid().optional().nullable(),
    organizationUnitId: z.string().cuid().optional().nullable(),
    sensitivity: z.enum(["PASTORAL", "SAFEGUARDING", "HIGHLY_RESTRICTED"]).default("PASTORAL")
  }),
  z.object({
    entity: z.literal("COUNSELLING_NOTE"),
    caseId: z.string().cuid(),
    body: z.string().trim().min(2).max(20000),
    nextContactAt: z.string().datetime().optional().nullable()
  }),
  z.object({
    entity: z.literal("ATTENDANCE_SESSION"),
    title: z.string().trim().min(2).max(180),
    targetType: z.enum(["SERVICE", "MEETING", "EVENT"]),
    targetId: z.string().trim().max(80).optional().nullable(),
    workspaceId: z.string().cuid().optional().nullable(),
    organizationUnitId: z.string().cuid().optional().nullable(),
    startsAt: z.string().datetime().optional().nullable(),
    endsAt: z.string().datetime().optional().nullable()
  }),
  z.object({
    entity: z.literal("ATTENDANCE_CHECK_IN"),
    sessionId: z.string().cuid(),
    userId: z.string().cuid().optional().nullable(),
    displayName: z.string().trim().min(2).max(160),
    email: z.string().email().optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable()
  }),
  z.object({
    entity: z.literal("EXPIRY_ITEM"),
    title: z.string().trim().min(2).max(180),
    targetType: z.enum(["FILE", "POLICY", "CERTIFICATE", "FORM", "PERMIT", "OTHER"]),
    targetId: z.string().trim().max(80).optional().nullable(),
    workspaceId: z.string().cuid().optional().nullable(),
    ownerId: z.string().cuid().optional().nullable(),
    reviewDueAt: z.string().datetime().optional().nullable(),
    expiresAt: z.string().datetime().optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable()
  }),
  z.object({
    entity: z.literal("BRANCH_TRANSFER"),
    userId: z.string().cuid(),
    fromUnitId: z.string().cuid().optional().nullable(),
    toUnitId: z.string().cuid(),
    reason: z.string().trim().max(1000).optional().nullable()
  })
]);

const deleteOperationSchema = z.object({
  entity: z.enum([
    "MINISTRY",
    "EVENT",
    "FOLLOW_UP",
    "RESOURCE",
    "BOOKING",
    "PROJECT",
    "COUNSELLING_CASE",
    "ATTENDANCE_SESSION",
    "EXPIRY_ITEM",
    "BRANCH_TRANSFER"
  ]),
  id: z.string().trim().min(1).max(64)
});

const createActivityByEntity: Record<string, string> = {
  MINISTRY: "church.ministry_created",
  EVENT: "church.event_created",
  ATTENDANCE: "church.attendance_created",
  VOLUNTEER: "church.volunteer_created",
  FOLLOW_UP: "church.follow_up_created",
  RESOURCE: "church.resource_created",
  BOOKING: "church.booking_created",
  PROJECT: activityActions.churchProjectCreated,
  PROJECT_TASK: activityActions.churchProjectTaskCreated,
  PROJECT_BUDGET: activityActions.churchProjectBudgetCreated,
  COUNSELLING_CASE: activityActions.counsellingCaseCreated,
  COUNSELLING_NOTE: activityActions.counsellingNoteCreated,
  ATTENDANCE_SESSION: activityActions.smartAttendanceSessionCreated,
  ATTENDANCE_CHECK_IN: activityActions.smartAttendanceCheckedIn,
  EXPIRY_ITEM: activityActions.documentExpiryCreated,
  BRANCH_TRANSFER: activityActions.branchTransferRequested
};

export async function GET() {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id);
    const [
      ministries,
      events,
      attendance,
      volunteers,
      followUps,
      resources,
      bookings,
      users,
      workspaces,
      units,
      projects,
      projectTasks,
      projectBudgets,
      counsellingCases,
      counsellingNotes,
      attendanceSessions,
      smartAttendanceRecords,
      expiryItems,
      branchTransfers
    ] =
      await Promise.all([
        prisma.ministry.findMany({ orderBy: { name: "asc" } }),
        prisma.churchEvent.findMany({ orderBy: { startsAt: "desc" }, take: 100 }),
        prisma.churchAttendance.findMany({ orderBy: { checkedInAt: "desc" }, take: 200 }),
        prisma.volunteerAssignment.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
        prisma.pastoralFollowUp.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
        prisma.churchResource.findMany({ orderBy: { name: "asc" } }),
        prisma.resourceBooking.findMany({ orderBy: { startsAt: "desc" }, take: 200 }),
        prisma.user.findMany({
          where: { deletedAt: null, suspendedAt: null, accessRevokedAt: null },
          select: { id: true, name: true, email: true },
          orderBy: { name: "asc" }
        }),
        prisma.workspace.findMany({
          where: { deletedAt: null },
          select: { id: true, name: true },
          orderBy: { name: "asc" }
        }),
        prisma.organizationUnit.findMany({
          where: { active: true },
          select: { id: true, name: true, type: true, parentId: true },
          orderBy: [{ type: "asc" }, { name: "asc" }]
        }),
        prisma.churchProject.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200 }),
        prisma.churchProjectTask.findMany({ orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }], take: 300 }),
        prisma.churchProjectBudgetLine.findMany({ orderBy: { createdAt: "desc" }, take: 300 }),
        prisma.counsellingCase.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200 }),
        prisma.counsellingNote.findMany({ orderBy: { createdAt: "desc" }, take: 300 }),
        prisma.smartAttendanceSession.findMany({ orderBy: [{ active: "desc" }, { createdAt: "desc" }], take: 200 }),
        prisma.smartAttendanceRecord.findMany({ orderBy: { checkedInAt: "desc" }, take: 500 }),
        prisma.documentExpiryItem.findMany({ orderBy: [{ status: "asc" }, { reviewDueAt: "asc" }], take: 300 }),
        prisma.branchTransferRequest.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200 })
      ]);
    return ok({
      ministries,
      events,
      attendance,
      volunteers,
      followUps,
      resources,
      bookings,
      users,
      workspaces,
      units,
      projects,
      projectTasks,
      projectBudgets,
      counsellingCases,
      counsellingNotes,
      attendanceSessions,
      smartAttendanceRecords,
      expiryItems,
      branchTransfers
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id);
    const parsed = operationSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid church operation.");
    const data = parsed.data;
    let result: unknown;

    if (data.entity === "MINISTRY") {
      result = await prisma.ministry.create({
        data: {
          name: data.name,
          description: data.description ?? null,
          leaderId: data.leaderId ?? null,
          workspaceId: data.workspaceId ?? null,
          createdById: user.id
        }
      });
    } else if (data.entity === "EVENT") {
      result = await prisma.churchEvent.create({
        data: {
          title: data.title,
          description: data.description ?? null,
          eventType: data.eventType,
          startsAt: new Date(data.startsAt),
          endsAt: new Date(data.endsAt),
          location: data.location ?? null,
          ministryId: data.ministryId ?? null,
          workspaceId: data.workspaceId ?? null,
          createdById: user.id
        }
      });
    } else if (data.entity === "ATTENDANCE") {
      result = await prisma.churchAttendance.create({
        data: {
          eventId: data.eventId,
          userId: data.userId ?? null,
          displayName: data.displayName,
          email: data.email ?? null
        }
      });
    } else if (data.entity === "VOLUNTEER") {
      result = await prisma.volunteerAssignment.create({
        data: {
          eventId: data.eventId,
          ministryId: data.ministryId ?? null,
          userId: data.userId,
          role: data.role,
          createdById: user.id
        }
      });
    } else if (data.entity === "FOLLOW_UP") {
      result = await prisma.pastoralFollowUp.create({
        data: {
          personName: data.personName,
          reason: data.reason,
          email: data.email ?? null,
          phone: data.phone ?? null,
          assignedToId: data.assignedToId ?? null,
          workspaceId: data.workspaceId ?? null,
          nextContactAt: data.nextContactAt ? new Date(data.nextContactAt) : null,
          createdById: user.id
        }
      });
    } else if (data.entity === "RESOURCE") {
      result = await prisma.churchResource.create({
        data: {
          name: data.name,
          category: data.category,
          location: data.location ?? null,
          description: data.description ?? null,
          createdById: user.id
        }
      });
    } else if (data.entity === "BOOKING") {
      const conflict = await prisma.resourceBooking.findFirst({
        where: {
          resourceId: data.resourceId,
          status: { in: ["PENDING", "APPROVED"] },
          startsAt: { lt: new Date(data.endsAt) },
          endsAt: { gt: new Date(data.startsAt) }
        }
      });
      if (conflict) throw new ApiError(409, "This resource is already booked for that time.");
      result = await prisma.resourceBooking.create({
        data: {
          resourceId: data.resourceId,
          workspaceId: data.workspaceId ?? null,
          eventId: data.eventId ?? null,
          title: data.title,
          startsAt: new Date(data.startsAt),
          endsAt: new Date(data.endsAt),
          requestedById: user.id
        }
      });
    } else if (data.entity === "PROJECT") {
      result = await prisma.churchProject.create({
        data: {
          name: data.name,
          description: data.description ?? null,
          projectType: data.projectType,
          workspaceId: data.workspaceId ?? null,
          organizationUnitId: data.organizationUnitId ?? null,
          ministryId: data.ministryId ?? null,
          ownerId: data.ownerId ?? null,
          budgetAmount: data.budgetAmount ?? null,
          budgetCurrency: (data.budgetCurrency ?? "GBP").toUpperCase(),
          startsAt: data.startsAt ? new Date(data.startsAt) : null,
          dueAt: data.dueAt ? new Date(data.dueAt) : null,
          createdById: user.id
        }
      });
    } else if (data.entity === "PROJECT_TASK") {
      result = await prisma.churchProjectTask.create({
        data: {
          projectId: data.projectId,
          title: data.title,
          description: data.description ?? null,
          assignedToId: data.assignedToId ?? null,
          priority: data.priority,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          createdById: user.id
        }
      });
    } else if (data.entity === "PROJECT_BUDGET") {
      result = await prisma.churchProjectBudgetLine.create({
        data: {
          projectId: data.projectId,
          title: data.title,
          category: data.category ?? null,
          amount: data.amount,
          currency: data.currency.toUpperCase(),
          notes: data.notes ?? null,
          createdById: user.id
        }
      });
    } else if (data.entity === "COUNSELLING_CASE") {
      result = await prisma.counsellingCase.create({
        data: {
          subjectName: data.subjectName,
          category: data.category,
          summary: data.summary,
          subjectUserId: data.subjectUserId ?? null,
          assignedToId: data.assignedToId ?? null,
          workspaceId: data.workspaceId ?? null,
          organizationUnitId: data.organizationUnitId ?? null,
          sensitivity: data.sensitivity,
          createdById: user.id
        }
      });
    } else if (data.entity === "COUNSELLING_NOTE") {
      const counsellingCase = await prisma.counsellingCase.findUnique({ where: { id: data.caseId } });
      if (!counsellingCase) throw new ApiError(404, "Counselling case not found.");
      result = await prisma.counsellingNote.create({
        data: {
          caseId: data.caseId,
          authorId: user.id,
          body: data.body,
          nextContactAt: data.nextContactAt ? new Date(data.nextContactAt) : null
        }
      });
    } else if (data.entity === "ATTENDANCE_SESSION") {
      result = await prisma.smartAttendanceSession.create({
        data: {
          targetType: data.targetType,
          targetId: data.targetId || null,
          title: data.title,
          workspaceId: data.workspaceId ?? null,
          organizationUnitId: data.organizationUnitId ?? null,
          startsAt: data.startsAt ? new Date(data.startsAt) : null,
          endsAt: data.endsAt ? new Date(data.endsAt) : null,
          qrToken: randomUUID(),
          createdById: user.id
        }
      });
    } else if (data.entity === "ATTENDANCE_CHECK_IN") {
      result = await prisma.smartAttendanceRecord.upsert({
        where: {
          sessionId_userId: {
            sessionId: data.sessionId,
            userId: data.userId ?? user.id
          }
        },
        update: {
          checkedInAt: new Date(),
          displayName: data.displayName,
          email: data.email ?? null,
          notes: data.notes ?? null
        },
        create: {
          sessionId: data.sessionId,
          userId: data.userId ?? user.id,
          displayName: data.displayName,
          email: data.email ?? null,
          notes: data.notes ?? null
        }
      });
    } else if (data.entity === "EXPIRY_ITEM") {
      result = await prisma.documentExpiryItem.create({
        data: {
          title: data.title,
          targetType: data.targetType,
          targetId: data.targetId || null,
          workspaceId: data.workspaceId ?? null,
          ownerId: data.ownerId ?? null,
          reviewDueAt: data.reviewDueAt ? new Date(data.reviewDueAt) : null,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
          notes: data.notes ?? null,
          createdById: user.id
        }
      });
    } else {
      const profile = await prisma.memberProfile.findUnique({
        where: { userId: data.userId },
        select: { currentOrganizationUnitId: true }
      });
      result = await prisma.branchTransferRequest.create({
        data: {
          userId: data.userId,
          fromUnitId: data.fromUnitId ?? profile?.currentOrganizationUnitId ?? null,
          toUnitId: data.toUnitId,
          reason: data.reason ?? null,
          requestedById: user.id
        }
      });
    }
    await logActivity({
      userId: user.id,
      action: createActivityByEntity[data.entity] ?? "church.operation_created",
      targetId: (result as { id?: string } | null)?.id,
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
    const body = (await request.json()) as {
      entity?:
        | "FOLLOW_UP"
        | "VOLUNTEER"
        | "BOOKING"
        | "PROJECT"
        | "PROJECT_TASK"
        | "PROJECT_BUDGET"
        | "COUNSELLING_CASE"
        | "ATTENDANCE_SESSION"
        | "EXPIRY_ITEM"
        | "BRANCH_TRANSFER";
      id?: string;
      status?: string;
      active?: boolean;
      reviewNote?: string;
    };
    if (!body.entity || !body.id) throw new ApiError(422, "Invalid update.");
    if (body.entity === "FOLLOW_UP") {
      if (!body.status) throw new ApiError(422, "Status is required.");
      return ok({ result: await prisma.pastoralFollowUp.update({ where: { id: body.id }, data: { status: body.status as never } }) });
    }
    if (body.entity === "VOLUNTEER") {
      if (!body.status) throw new ApiError(422, "Status is required.");
      return ok({ result: await prisma.volunteerAssignment.update({ where: { id: body.id }, data: { status: body.status as never } }) });
    }
    if (body.entity === "BOOKING") {
      if (!body.status) throw new ApiError(422, "Status is required.");
      return ok({ result: await prisma.resourceBooking.update({
        where: { id: body.id },
        data: {
          status: body.status as never,
          approvedById: body.status === "APPROVED" ? user.id : null
        }
      }) });
    }
    if (body.entity === "PROJECT") {
      if (!body.status) throw new ApiError(422, "Status is required.");
      const result = await prisma.churchProject.update({
        where: { id: body.id },
        data: {
          status: body.status as never,
          completedAt: body.status === "COMPLETED" ? new Date() : null,
          approvedById: body.status === "ACTIVE" ? user.id : undefined,
          approvedAt: body.status === "ACTIVE" ? new Date() : undefined
        }
      });
      return ok({ result });
    }
    if (body.entity === "PROJECT_TASK") {
      if (!body.status) throw new ApiError(422, "Status is required.");
      return ok({
        result: await prisma.churchProjectTask.update({
          where: { id: body.id },
          data: { status: body.status as never, completedAt: body.status === "DONE" ? new Date() : null }
        })
      });
    }
    if (body.entity === "PROJECT_BUDGET") {
      if (!body.status) throw new ApiError(422, "Status is required.");
      return ok({
        result: await prisma.churchProjectBudgetLine.update({
          where: { id: body.id },
          data: {
            status: body.status as never,
            approvedById: body.status === "APPROVED" ? user.id : undefined,
            paidAt: body.status === "PAID" ? new Date() : null
          }
        })
      });
    }
    if (body.entity === "COUNSELLING_CASE") {
      if (!body.status) throw new ApiError(422, "Status is required.");
      const result = await prisma.counsellingCase.update({
        where: { id: body.id },
        data: { status: body.status as never, closedAt: body.status === "CLOSED" ? new Date() : null }
      });
      await logActivity({ userId: user.id, action: activityActions.counsellingCaseUpdated, targetId: body.id });
      return ok({ result });
    }
    if (body.entity === "ATTENDANCE_SESSION") {
      return ok({
        result: await prisma.smartAttendanceSession.update({
          where: { id: body.id },
          data: { active: body.active ?? false }
        })
      });
    }
    if (body.entity === "EXPIRY_ITEM") {
      if (!body.status) throw new ApiError(422, "Status is required.");
      const result = await prisma.documentExpiryItem.update({
        where: { id: body.id },
        data: {
          status: body.status as never,
          reviewedById: user.id,
          reviewedAt: new Date()
        }
      });
      await logActivity({ userId: user.id, action: activityActions.documentExpiryUpdated, targetId: body.id });
      return ok({ result });
    }
    if (!body.status) throw new ApiError(422, "Status is required.");
    const transfer = await prisma.branchTransferRequest.update({
      where: { id: body.id },
      data: {
        status: body.status as never,
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewNote: body.reviewNote ?? null
      }
    });
    if (body.status === "APPROVED") {
      await prisma.memberProfile.upsert({
        where: { userId: transfer.userId },
        update: { currentOrganizationUnitId: transfer.toUnitId },
        create: { userId: transfer.userId, currentOrganizationUnitId: transfer.toUnitId }
      });
    }
    await logActivity({ userId: user.id, action: activityActions.branchTransferReviewed, targetId: body.id, metadata: { status: body.status } });
    return ok({ result: transfer });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id, "Only administrators can delete church operation records.");
    const parsed = deleteOperationSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid delete request.");
    }

    const { entity, id } = parsed.data;
    let label = "";
    let action: string = "church.operation_deleted";
    let cleanup: Record<string, number> = {};

    if (entity === "MINISTRY") {
      const ministry = await prisma.ministry.findUnique({ where: { id } });
      if (!ministry) throw new ApiError(404, "Ministry not found.");
      label = ministry.name;
      action = activityActions.ministryDeleted;
      cleanup = await prisma.$transaction(async (tx) => {
        const [events, volunteers] = await Promise.all([
          tx.churchEvent.updateMany({ where: { ministryId: id }, data: { ministryId: null } }),
          tx.volunteerAssignment.updateMany({ where: { ministryId: id }, data: { ministryId: null } })
        ]);
        await tx.ministry.delete({ where: { id } });
        return { eventsDetached: events.count, volunteersDetached: volunteers.count };
      });
    } else if (entity === "EVENT") {
      const event = await prisma.churchEvent.findUnique({ where: { id } });
      if (!event) throw new ApiError(404, "Event not found.");
      label = event.title;
      action = activityActions.churchEventDeleted;
      cleanup = await prisma.$transaction(async (tx) => {
        const [attendance, volunteers, bookings] = await Promise.all([
          tx.churchAttendance.deleteMany({ where: { eventId: id } }),
          tx.volunteerAssignment.deleteMany({ where: { eventId: id } }),
          tx.resourceBooking.updateMany({ where: { eventId: id }, data: { eventId: null } })
        ]);
        await tx.churchEvent.delete({ where: { id } });
        return {
          attendanceDeleted: attendance.count,
          volunteersDeleted: volunteers.count,
          bookingsDetached: bookings.count
        };
      });
    } else if (entity === "FOLLOW_UP") {
      const followUp = await prisma.pastoralFollowUp.findUnique({ where: { id } });
      if (!followUp) throw new ApiError(404, "Pastoral follow-up not found.");
      label = followUp.personName;
      action = activityActions.pastoralFollowUpDeleted;
      await prisma.pastoralFollowUp.delete({ where: { id } });
    } else if (entity === "RESOURCE") {
      const resource = await prisma.churchResource.findUnique({ where: { id } });
      if (!resource) throw new ApiError(404, "Resource not found.");
      label = resource.name;
      action = activityActions.churchResourceDeleted;
      cleanup = await prisma.$transaction(async (tx) => {
        const bookings = await tx.resourceBooking.deleteMany({ where: { resourceId: id } });
        await tx.churchResource.delete({ where: { id } });
        return { bookingsDeleted: bookings.count };
      });
    } else if (entity === "BOOKING") {
      const booking = await prisma.resourceBooking.findUnique({ where: { id } });
      if (!booking) throw new ApiError(404, "Booking not found.");
      label = booking.title;
      action = activityActions.resourceBookingDeleted;
      await prisma.resourceBooking.delete({ where: { id } });
    } else if (entity === "PROJECT") {
      const project = await prisma.churchProject.findUnique({ where: { id } });
      if (!project) throw new ApiError(404, "Project not found.");
      label = project.name;
      action = activityActions.churchProjectDeleted;
      cleanup = await prisma.$transaction(async (tx) => {
        const [tasks, budgets, documents] = await Promise.all([
          tx.churchProjectTask.deleteMany({ where: { projectId: id } }),
          tx.churchProjectBudgetLine.deleteMany({ where: { projectId: id } }),
          tx.churchProjectDocument.deleteMany({ where: { projectId: id } })
        ]);
        await tx.churchProject.delete({ where: { id } });
        return { tasksDeleted: tasks.count, budgetsDeleted: budgets.count, documentsDetached: documents.count };
      });
    } else if (entity === "COUNSELLING_CASE") {
      const counsellingCase = await prisma.counsellingCase.findUnique({ where: { id } });
      if (!counsellingCase) throw new ApiError(404, "Counselling case not found.");
      label = counsellingCase.subjectName;
      action = activityActions.counsellingCaseDeleted;
      cleanup = await prisma.$transaction(async (tx) => {
        const notes = await tx.counsellingNote.deleteMany({ where: { caseId: id } });
        await tx.counsellingCase.delete({ where: { id } });
        return { notesDeleted: notes.count };
      });
    } else if (entity === "ATTENDANCE_SESSION") {
      const session = await prisma.smartAttendanceSession.findUnique({ where: { id } });
      if (!session) throw new ApiError(404, "Attendance session not found.");
      label = session.title;
      action = activityActions.smartAttendanceDeleted;
      cleanup = await prisma.$transaction(async (tx) => {
        const records = await tx.smartAttendanceRecord.deleteMany({ where: { sessionId: id } });
        await tx.smartAttendanceSession.delete({ where: { id } });
        return { recordsDeleted: records.count };
      });
    } else if (entity === "EXPIRY_ITEM") {
      const item = await prisma.documentExpiryItem.findUnique({ where: { id } });
      if (!item) throw new ApiError(404, "Expiry alert not found.");
      label = item.title;
      action = activityActions.documentExpiryDeleted;
      await prisma.documentExpiryItem.delete({ where: { id } });
    } else if (entity === "BRANCH_TRANSFER") {
      const transfer = await prisma.branchTransferRequest.findUnique({ where: { id } });
      if (!transfer) throw new ApiError(404, "Branch transfer request not found.");
      label = "Branch transfer request";
      action = activityActions.branchTransferReviewed;
      await prisma.branchTransferRequest.delete({ where: { id } });
    }

    await logActivity({
      userId: user.id,
      action,
      targetId: id,
      metadata: {
        entity,
        label: entity === "FOLLOW_UP" ? "Pastoral follow-up record" : label,
        ...cleanup
      }
    });

    return ok({ deleted: true, entity, id, cleanup });
  } catch (error) {
    return handleRouteError(error);
  }
}
