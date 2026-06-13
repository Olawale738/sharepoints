import { z } from "zod";

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
  })
]);

const deleteOperationSchema = z.object({
  entity: z.enum(["MINISTRY", "EVENT", "FOLLOW_UP", "RESOURCE", "BOOKING"]),
  id: z.string().trim().min(1).max(64)
});

export async function GET() {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id);
    const [ministries, events, attendance, volunteers, followUps, resources, bookings, users] =
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
        })
      ]);
    return ok({ ministries, events, attendance, volunteers, followUps, resources, bookings, users });
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
    } else {
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
    }
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
      entity?: "FOLLOW_UP" | "VOLUNTEER" | "BOOKING";
      id?: string;
      status?: string;
    };
    if (!body.entity || !body.id || !body.status) throw new ApiError(422, "Invalid update.");
    if (body.entity === "FOLLOW_UP") {
      return ok({ result: await prisma.pastoralFollowUp.update({ where: { id: body.id }, data: { status: body.status as never } }) });
    }
    if (body.entity === "VOLUNTEER") {
      return ok({ result: await prisma.volunteerAssignment.update({ where: { id: body.id }, data: { status: body.status as never } }) });
    }
    return ok({
      result: await prisma.resourceBooking.update({
        where: { id: body.id },
        data: {
          status: body.status as never,
          approvedById: body.status === "APPROVED" ? user.id : null
        }
      })
    });
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
    let action: (typeof activityActions)[keyof typeof activityActions];
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
    } else {
      const booking = await prisma.resourceBooking.findUnique({ where: { id } });
      if (!booking) throw new ApiError(404, "Booking not found.");
      label = booking.title;
      action = activityActions.resourceBookingDeleted;
      await prisma.resourceBooking.delete({ where: { id } });
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
