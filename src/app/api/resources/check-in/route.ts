import { ResourceCheckInStatus } from "@prisma/client";
import { z } from "zod";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const checkInSchema = z.object({
  token: z.string().uuid(),
  note: z.string().trim().max(500).nullable().optional()
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = checkInSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, "Invalid resource QR code.");
    const pass = await prisma.smartResourcePass.findUnique({ where: { qrToken: parsed.data.token } });
    if (!pass?.enabled) throw new ApiError(404, "This resource pass is invalid or disabled.");
    const resource = await prisma.churchResource.findFirst({
      where: { id: pass.resourceId, active: true }
    });
    if (!resource) throw new ApiError(404, "Resource not found.");
    const activeCheckIn = await prisma.resourceCheckIn.findFirst({
      where: {
        resourceId: resource.id,
        userId: user.id,
        status: ResourceCheckInStatus.CHECKED_IN
      },
      orderBy: { checkedInAt: "desc" }
    });
    const currentBooking = await prisma.resourceBooking.findFirst({
      where: {
        resourceId: resource.id,
        requestedById: user.id,
        status: "APPROVED",
        startsAt: { lte: new Date() },
        endsAt: { gte: new Date() }
      },
      orderBy: { startsAt: "desc" }
    });

    if (activeCheckIn) {
      const checkIn = await prisma.resourceCheckIn.update({
        where: { id: activeCheckIn.id },
        data: {
          status: ResourceCheckInStatus.CHECKED_OUT,
          checkedOutAt: new Date(),
          note: parsed.data.note ?? activeCheckIn.note
        }
      });
      await logActivity({
        userId: user.id,
        action: activityActions.resourceCheckedOut,
        targetId: resource.id,
        metadata: { resourceName: resource.name }
      });
      return ok({ action: "CHECKED_OUT", resource, checkIn });
    }

    const checkIn = await prisma.resourceCheckIn.create({
      data: {
        resourceId: resource.id,
        bookingId: currentBooking?.id ?? null,
        userId: user.id,
        note: parsed.data.note ?? null
      }
    });
    await logActivity({
      userId: user.id,
      action: activityActions.resourceCheckedIn,
      targetId: resource.id,
      metadata: { resourceName: resource.name, bookingId: currentBooking?.id }
    });
    return ok({ action: "CHECKED_IN", resource, checkIn }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
