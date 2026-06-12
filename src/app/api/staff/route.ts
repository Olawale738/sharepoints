import { AvailabilityStatus, DutyScheduleStatus, LeaveRequestStatus, NotificationPriority } from "@prisma/client";
import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { createNotification } from "@/lib/notifications";
import { activeOrganizationUsers, isOperationsManager, requireOperationsManager } from "@/lib/operations";
import { prisma } from "@/lib/prisma";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("LEAVE"),
    workspaceId: z.string().cuid().optional().nullable(),
    leaveType: z.string().trim().min(2).max(80),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    reason: z.string().trim().max(1000).optional().nullable()
  }),
  z.object({
    action: z.literal("AVAILABILITY"),
    weekday: z.number().int().min(0).max(6),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
    status: z.nativeEnum(AvailabilityStatus),
    note: z.string().trim().max(500).optional().nullable()
  }),
  z.object({
    action: z.literal("DUTY"),
    workspaceId: z.string().cuid().optional().nullable(),
    title: z.string().trim().min(2).max(160),
    role: z.string().trim().max(120).optional().nullable(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    assignedToId: z.string().cuid(),
    substituteUserId: z.string().cuid().optional().nullable(),
    notes: z.string().trim().max(1000).optional().nullable()
  }),
  z.object({
    action: z.literal("REVIEW_LEAVE"),
    id: z.string().cuid(),
    status: z.nativeEnum(LeaveRequestStatus),
    reviewNote: z.string().trim().max(1000).optional().nullable()
  }),
  z.object({
    action: z.literal("UPDATE_DUTY"),
    id: z.string().cuid(),
    status: z.nativeEnum(DutyScheduleStatus).optional(),
    substituteUserId: z.string().cuid().optional().nullable()
  })
]);

export async function GET() {
  try {
    const user = await requireUser();
    const manager = await isOperationsManager(user.id);
    const [leaveRequests, availability, duties, users] = await Promise.all([
      prisma.leaveRequest.findMany({
        where: manager ? {} : { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 500
      }),
      prisma.staffAvailability.findMany({
        where: manager ? {} : { userId: user.id },
        orderBy: [{ userId: "asc" }, { weekday: "asc" }]
      }),
      prisma.dutySchedule.findMany({
        where: manager
          ? {}
          : { OR: [{ assignedToId: user.id }, { substituteUserId: user.id }] },
        orderBy: { startsAt: "asc" },
        take: 500
      }),
      manager ? activeOrganizationUsers() : Promise.resolve([])
    ]);
    return ok({ leaveRequests, availability, duties, users, canManage: manager });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid staff action.");
    const data = parsed.data;

    if (data.action === "LEAVE") {
      const startsAt = new Date(data.startsAt);
      const endsAt = new Date(data.endsAt);
      if (endsAt <= startsAt) throw new ApiError(422, "Leave end date must be after the start date.");
      const conflict = await prisma.leaveRequest.findFirst({
        where: {
          userId: user.id,
          status: { in: ["PENDING", "APPROVED"] },
          startsAt: { lte: endsAt },
          endsAt: { gte: startsAt }
        }
      });
      if (conflict) throw new ApiError(409, "This leave period overlaps another request.");
      const leaveRequest = await prisma.leaveRequest.create({
        data: {
          userId: user.id,
          workspaceId: data.workspaceId ?? null,
          leaveType: data.leaveType,
          startsAt,
          endsAt,
          reason: data.reason || null
        }
      });
      return ok({ leaveRequest }, { status: 201 });
    }

    if (data.action === "AVAILABILITY") {
      const availability = await prisma.staffAvailability.upsert({
        where: { userId_weekday: { userId: user.id, weekday: data.weekday } },
        update: {
          startTime: data.startTime || null,
          endTime: data.endTime || null,
          status: data.status,
          note: data.note || null
        },
        create: {
          userId: user.id,
          weekday: data.weekday,
          startTime: data.startTime || null,
          endTime: data.endTime || null,
          status: data.status,
          note: data.note || null
        }
      });
      return ok({ availability });
    }

    await requireOperationsManager(user.id);

    if (data.action === "DUTY") {
      const duty = await prisma.dutySchedule.create({
        data: {
          workspaceId: data.workspaceId ?? null,
          title: data.title,
          role: data.role || null,
          startsAt: new Date(data.startsAt),
          endsAt: new Date(data.endsAt),
          assignedToId: data.assignedToId,
          substituteUserId: data.substituteUserId ?? null,
          notes: data.notes || null,
          createdById: user.id
        }
      });
      await createNotification({
        userId: duty.assignedToId,
        workspaceId: duty.workspaceId,
        type: "DUTY_ASSIGNED",
        title: `Duty assigned: ${duty.title}`,
        body: duty.startsAt.toLocaleString("en-GB"),
        href: "/dashboard/operations?tab=staff",
        priority: NotificationPriority.HIGH,
        deliverAt: new Date(Math.max(Date.now(), duty.startsAt.getTime() - 24 * 60 * 60 * 1000))
      });
      return ok({ duty }, { status: 201 });
    }

    if (data.action === "REVIEW_LEAVE") {
      const leaveRequest = await prisma.leaveRequest.update({
        where: { id: data.id },
        data: {
          status: data.status,
          reviewerId: user.id,
          reviewedAt: new Date(),
          reviewNote: data.reviewNote || null
        }
      });
      await createNotification({
        userId: leaveRequest.userId,
        workspaceId: leaveRequest.workspaceId,
        type: "LEAVE_REVIEWED",
        title: `Leave request ${leaveRequest.status.toLowerCase()}`,
        body: leaveRequest.reviewNote,
        href: "/dashboard/operations?tab=staff"
      });
      return ok({ leaveRequest });
    }

    const duty = await prisma.dutySchedule.update({
      where: { id: data.id },
      data: { status: data.status, substituteUserId: data.substituteUserId }
    });
    const notifyIds = [duty.assignedToId, duty.substituteUserId].filter(Boolean) as string[];
    await Promise.all(
      notifyIds.map((userId) =>
        createNotification({
          userId,
          workspaceId: duty.workspaceId,
          type: "DUTY_UPDATED",
          title: `Duty updated: ${duty.title}`,
          href: "/dashboard/operations?tab=staff"
        })
      )
    );
    return ok({ duty });
  } catch (error) {
    return handleRouteError(error);
  }
}
