import { z } from "zod";
import { randomUUID } from "node:crypto";
import { ResourceCheckInStatus } from "@prisma/client";

import { auth } from "@/auth";
import { activityActions, logActivity } from "@/lib/activity";
import { evaluateAccessScan, hashAccessIp, hashAccessSecret } from "@/lib/access-control";
import { ApiError, handleRouteError, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const scanSchema = z.object({
  accessPointId: z.string().cuid(),
  qrToken: z.string().trim().max(200).nullable().optional(),
  organizationId: z.string().trim().max(80).nullable().optional(),
  visitorToken: z.string().trim().max(200).nullable().optional(),
  purpose: z.enum(["ACCESS", "ATTENDANCE", "EVENT", "RESOURCE", "EMERGENCY_ROLL_CALL", "VISITOR"]).default("ACCESS"),
  attendanceSessionId: z.string().cuid().nullable().optional(),
  eventId: z.string().cuid().nullable().optional(),
  resourceId: z.string().cuid().nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
  method: z.enum(["QR", "NFC_RFID", "MANUAL", "HARDWARE_API"]).default("QR"),
  deviceId: z.string().cuid().nullable().optional(),
  deviceSecret: z.string().trim().max(200).nullable().optional()
});

async function applySuccessfulQrActions(input: {
  member: { id: string; name?: string | null; email?: string | null } | null;
  scannedById?: string | null;
  attendanceSessionId?: string | null;
  eventId?: string | null;
  resourceId?: string | null;
  note?: string | null;
  purpose: string;
}) {
  if (!input.member) return {};
  const displayName = input.member.name ?? input.member.email ?? "LETW member";
  const sideEffects: {
    attendance?: { id: string; title: string };
    event?: { id: string; title: string; registrationId: string };
    resource?: { id: string; name: string; action: "CHECKED_IN" | "CHECKED_OUT"; checkInId: string };
  } = {};

  if (input.attendanceSessionId) {
    const attendanceSession = await prisma.smartAttendanceSession.findFirst({
      where: { id: input.attendanceSessionId, active: true }
    });
    if (attendanceSession) {
      const record = await prisma.smartAttendanceRecord.upsert({
        where: {
          sessionId_userId: {
            sessionId: attendanceSession.id,
            userId: input.member.id
          }
        },
        update: {
          displayName,
          email: input.member.email ?? null,
          method: input.purpose === "EMERGENCY_ROLL_CALL" ? "EMERGENCY_QR" : "QR",
          checkedInAt: new Date(),
          notes: input.note ?? undefined
        },
        create: {
          sessionId: attendanceSession.id,
          userId: input.member.id,
          displayName,
          email: input.member.email ?? null,
          method: input.purpose === "EMERGENCY_ROLL_CALL" ? "EMERGENCY_QR" : "QR",
          notes: input.note ?? null
        }
      });
      await logActivity({
        userId: input.scannedById ?? input.member.id,
        action:
          input.purpose === "EMERGENCY_ROLL_CALL"
            ? activityActions.qrEmergencyRollCall
            : activityActions.smartAttendanceCheckedIn,
        targetId: attendanceSession.id,
        metadata: { recordId: record.id, memberId: input.member.id, title: attendanceSession.title }
      });
      sideEffects.attendance = { id: record.id, title: attendanceSession.title };
    }
  }

  if (input.eventId) {
    const event = await prisma.churchEvent.findUnique({ where: { id: input.eventId } });
    if (event) {
      const registration = await prisma.eventRegistration.upsert({
        where: {
          eventId_userId: {
            eventId: event.id,
            userId: input.member.id
          }
        },
        update: {
          status: "CHECKED_IN",
          checkedInAt: new Date(),
          checkedInById: input.scannedById ?? input.member.id
        },
        create: {
          eventId: event.id,
          userId: input.member.id,
          displayName,
          email: input.member.email ?? null,
          ticketCode: `LETW-EVT-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`,
          qrToken: randomUUID(),
          status: "CHECKED_IN",
          checkedInAt: new Date(),
          checkedInById: input.scannedById ?? input.member.id
        }
      });
      await prisma.churchAttendance
        .upsert({
          where: { eventId_userId: { eventId: event.id, userId: input.member.id } },
          update: { checkedInAt: new Date(), displayName, email: input.member.email ?? null },
          create: { eventId: event.id, userId: input.member.id, displayName, email: input.member.email ?? null }
        })
        .catch(() => undefined);
      await logActivity({
        userId: input.scannedById ?? input.member.id,
        action: activityActions.qrEventCheckIn,
        targetId: event.id,
        metadata: { registrationId: registration.id, memberId: input.member.id, title: event.title }
      });
      sideEffects.event = { id: event.id, title: event.title, registrationId: registration.id };
    }
  }

  if (input.resourceId) {
    const resource = await prisma.churchResource.findFirst({ where: { id: input.resourceId, active: true } });
    if (resource) {
      const activeCheckIn = await prisma.resourceCheckIn.findFirst({
        where: {
          resourceId: resource.id,
          userId: input.member.id,
          status: ResourceCheckInStatus.CHECKED_IN
        },
        orderBy: { checkedInAt: "desc" }
      });
      if (activeCheckIn) {
        const checkIn = await prisma.resourceCheckIn.update({
          where: { id: activeCheckIn.id },
          data: {
            status: ResourceCheckInStatus.CHECKED_OUT,
            checkedOutAt: new Date(),
            note: input.note ?? activeCheckIn.note
          }
        });
        sideEffects.resource = { id: resource.id, name: resource.name, action: "CHECKED_OUT", checkInId: checkIn.id };
      } else {
        const checkIn = await prisma.resourceCheckIn.create({
          data: {
            resourceId: resource.id,
            userId: input.member.id,
            note: input.note ?? null
          }
        });
        sideEffects.resource = { id: resource.id, name: resource.name, action: "CHECKED_IN", checkInId: checkIn.id };
      }
      await logActivity({
        userId: input.scannedById ?? input.member.id,
        action: activityActions.qrResourceAccess,
        targetId: resource.id,
        metadata: { memberId: input.member.id, resourceName: resource.name, sideEffect: sideEffects.resource }
      });
    }
  }

  return sideEffects;
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    const parsed = scanSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid access scan.");
    const data = parsed.data;
    if (!data.qrToken && !data.organizationId && !data.visitorToken) {
      throw new ApiError(422, "Provide a Digital ID QR token, organization ID, or visitor pass token.");
    }

    let deviceId: string | null = null;
    if (data.deviceId) {
      const device = await prisma.accessHardwareDevice.findFirst({
        where: {
          id: data.deviceId,
          accessPointId: data.accessPointId,
          active: true
        }
      });
      if (!device) throw new ApiError(403, "Access device is not registered for this access point.");
      if (!session?.user?.id) {
        if (!device.sharedSecretHash || !data.deviceSecret || hashAccessSecret(data.deviceSecret) !== device.sharedSecretHash) {
          throw new ApiError(401, "Valid access device secret is required.");
        }
      }
      await prisma.accessHardwareDevice.update({
        where: { id: device.id },
        data: { lastSeenAt: new Date() }
      });
      deviceId = device.id;
    } else if (!session?.user?.id) {
      throw new ApiError(401, "Authentication or registered device secret is required.");
    }

    const forwardedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const result = await evaluateAccessScan({
      accessPointId: data.accessPointId,
      qrToken: data.qrToken,
      organizationId: data.organizationId,
      visitorToken: data.visitorToken,
      purpose: data.purpose,
      method: data.method,
      scannedById: session?.user?.id ?? null,
      deviceId,
      ipHash: hashAccessIp(forwardedIp),
      userAgent: request.headers.get("user-agent")
    });
    const sideEffects = result.granted
      ? await applySuccessfulQrActions({
          member: result.member,
          scannedById: session?.user?.id ?? null,
          attendanceSessionId: data.attendanceSessionId,
          eventId: data.eventId,
          resourceId: data.resourceId ?? result.accessPoint?.resourceId ?? null,
          note: data.note,
          purpose: data.purpose
        })
      : {};

    return ok({
      granted: result.granted,
      decision: result.decision,
      reason: result.reason,
      accessPoint: result.accessPoint
        ? {
            id: result.accessPoint.id,
            name: result.accessPoint.name,
            pointType: result.accessPoint.pointType,
            location: result.accessPoint.location
          }
        : null,
      member: result.member,
      visitor: result.visitor,
      verification: result.verification,
      security: result.security,
      sideEffects
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
