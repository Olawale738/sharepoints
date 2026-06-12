import { EventRegistrationStatus, NotificationPriority } from "@prisma/client";
import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { createNotification } from "@/lib/notifications";
import { isOperationsManager, randomTicketCode, requireOperationsManager } from "@/lib/operations";
import { prisma } from "@/lib/prisma";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("CONFIGURE"),
    eventId: z.string().cuid(),
    capacity: z.number().int().positive().optional().nullable(),
    registrationOpensAt: z.string().datetime().optional().nullable(),
    registrationClosesAt: z.string().datetime().optional().nullable(),
    invitationCode: z.string().trim().min(4).max(60).optional().nullable(),
    requireApproval: z.boolean().optional(),
    badgeEnabled: z.boolean().optional(),
    certificateEnabled: z.boolean().optional(),
    paymentRequired: z.boolean().optional(),
    paymentAmount: z.number().int().nonnegative().optional().nullable(),
    paymentCurrency: z.string().trim().length(3).optional(),
    paymentUrl: z.string().url().optional().nullable()
  }),
  z.object({
    action: z.literal("REGISTER"),
    eventId: z.string().cuid(),
    displayName: z.string().trim().min(2).max(120),
    email: z.string().email().optional().nullable(),
    phone: z.string().trim().max(40).optional().nullable(),
    invitationCode: z.string().trim().max(60).optional().nullable(),
    paymentReference: z.string().trim().max(160).optional().nullable()
  }),
  z.object({
    action: z.literal("STATUS"),
    registrationId: z.string().cuid(),
    status: z.nativeEnum(EventRegistrationStatus)
  }),
  z.object({
    action: z.literal("CHECK_IN"),
    token: z.string().trim().min(10).max(200)
  }),
  z.object({
    action: z.literal("PAYMENT"),
    registrationId: z.string().cuid(),
    paymentStatus: z.enum(["PENDING", "PAID", "FAILED", "WAIVED"]),
    paymentReference: z.string().trim().max(160).optional().nullable()
  }),
  z.object({
    action: z.enum(["BADGE", "CERTIFICATE"]),
    registrationId: z.string().cuid()
  })
]);

export async function GET() {
  try {
    const user = await requireUser();
    const manager = await isOperationsManager(user.id);
    const [events, configurations, registrations] = await Promise.all([
      prisma.churchEvent.findMany({ orderBy: { startsAt: "desc" }, take: 200 }),
      prisma.eventTicketConfiguration.findMany(),
      prisma.eventRegistration.findMany({
        where: manager ? {} : { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 500
      })
    ]);
    return ok({ events, configurations, registrations, canManage: manager });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid ticketing action.");
    const data = parsed.data;

    if (data.action === "CONFIGURE") {
      await requireOperationsManager(user.id);
      const event = await prisma.churchEvent.findUnique({ where: { id: data.eventId } });
      if (!event) throw new ApiError(404, "Event not found.");
      const configuration = await prisma.eventTicketConfiguration.upsert({
        where: { eventId: data.eventId },
        update: {
          capacity: data.capacity,
          registrationOpensAt: data.registrationOpensAt ? new Date(data.registrationOpensAt) : null,
          registrationClosesAt: data.registrationClosesAt ? new Date(data.registrationClosesAt) : null,
          invitationCode: data.invitationCode || null,
          requireApproval: data.requireApproval ?? false,
          badgeEnabled: data.badgeEnabled ?? true,
          certificateEnabled: data.certificateEnabled ?? false,
          paymentRequired: data.paymentRequired ?? false,
          paymentAmount: data.paymentAmount,
          paymentCurrency: data.paymentCurrency?.toUpperCase() ?? "GBP",
          paymentUrl: data.paymentUrl || null
        },
        create: {
          eventId: data.eventId,
          capacity: data.capacity,
          registrationOpensAt: data.registrationOpensAt ? new Date(data.registrationOpensAt) : null,
          registrationClosesAt: data.registrationClosesAt ? new Date(data.registrationClosesAt) : null,
          invitationCode: data.invitationCode || null,
          requireApproval: data.requireApproval ?? false,
          badgeEnabled: data.badgeEnabled ?? true,
          certificateEnabled: data.certificateEnabled ?? false,
          paymentRequired: data.paymentRequired ?? false,
          paymentAmount: data.paymentAmount,
          paymentCurrency: data.paymentCurrency?.toUpperCase() ?? "GBP",
          paymentUrl: data.paymentUrl || null,
          createdById: user.id
        }
      });
      return ok({ configuration });
    }

    if (data.action === "REGISTER") {
      const [event, configuration] = await Promise.all([
        prisma.churchEvent.findUnique({ where: { id: data.eventId } }),
        prisma.eventTicketConfiguration.findUnique({ where: { eventId: data.eventId } })
      ]);
      if (!event || !configuration) throw new ApiError(404, "Event registration is not configured.");
      const now = new Date();
      if (configuration.registrationOpensAt && configuration.registrationOpensAt > now) {
        throw new ApiError(409, "Registration has not opened yet.");
      }
      if (configuration.registrationClosesAt && configuration.registrationClosesAt < now) {
        throw new ApiError(409, "Registration is closed.");
      }
      if (configuration.invitationCode && data.invitationCode !== configuration.invitationCode) {
        throw new ApiError(403, "A valid invitation code is required.");
      }
      const activeCount = await prisma.eventRegistration.count({
        where: { eventId: data.eventId, status: { not: "CANCELLED" } }
      });
      const waitlisted = Boolean(configuration.capacity && activeCount >= configuration.capacity);
      const status = waitlisted
        ? EventRegistrationStatus.WAITLISTED
        : configuration.requireApproval
          ? EventRegistrationStatus.REGISTERED
          : EventRegistrationStatus.APPROVED;
      const registration = await prisma.eventRegistration.upsert({
        where: { eventId_userId: { eventId: data.eventId, userId: user.id } },
        update: {
          displayName: data.displayName,
          email: data.email || user.email || null,
          phone: data.phone || null,
          invitationCodeUsed: data.invitationCode || null,
          status,
          paymentStatus: configuration.paymentRequired ? "PENDING" : "NOT_REQUIRED",
          paymentReference: data.paymentReference || null
        },
        create: {
          eventId: data.eventId,
          userId: user.id,
          displayName: data.displayName,
          email: data.email || user.email || null,
          phone: data.phone || null,
          ticketCode: randomTicketCode("LETW"),
          qrToken: crypto.randomUUID(),
          invitationCodeUsed: data.invitationCode || null,
          status,
          paymentStatus: configuration.paymentRequired ? "PENDING" : "NOT_REQUIRED",
          paymentReference: data.paymentReference || null
        }
      });
      await createNotification({
        userId: user.id,
        type: "EVENT_REGISTRATION",
        title: `${event.title}: ${registration.status.toLowerCase().replaceAll("_", " ")}`,
        body: registration.ticketCode,
        href: "/dashboard/operations?tab=events",
        priority: NotificationPriority.HIGH
      });
      return ok({ registration, paymentUrl: configuration.paymentUrl });
    }

    await requireOperationsManager(user.id);

    if (data.action === "CHECK_IN") {
      const registration = await prisma.eventRegistration.findUnique({ where: { qrToken: data.token } });
      if (!registration) throw new ApiError(404, "Ticket not found.");
      if (registration.status === "CANCELLED" || registration.status === "WAITLISTED") {
        throw new ApiError(409, "This ticket is not eligible for check-in.");
      }
      const updated = await prisma.eventRegistration.update({
        where: { id: registration.id },
        data: { status: "CHECKED_IN", checkedInAt: new Date(), checkedInById: user.id }
      });
      if (registration.userId) {
        await prisma.churchAttendance
          .upsert({
            where: { eventId_userId: { eventId: registration.eventId, userId: registration.userId } },
            update: { checkedInAt: new Date(), displayName: registration.displayName },
            create: {
              eventId: registration.eventId,
              userId: registration.userId,
              displayName: registration.displayName,
              email: registration.email
            }
          })
          .catch(() => undefined);
      } else {
        await prisma.churchAttendance
          .create({
            data: {
              eventId: registration.eventId,
              displayName: registration.displayName,
              email: registration.email
            }
          })
          .catch(() => undefined);
      }
      return ok({ registration: updated });
    }

    if (data.action === "PAYMENT") {
      const registration = await prisma.eventRegistration.update({
        where: { id: data.registrationId },
        data: { paymentStatus: data.paymentStatus, paymentReference: data.paymentReference || null }
      });
      return ok({ registration });
    }

    if (data.action === "BADGE" || data.action === "CERTIFICATE") {
      const registration = await prisma.eventRegistration.update({
        where: { id: data.registrationId },
        data:
          data.action === "BADGE"
            ? { badgePrintedAt: new Date() }
            : { certificateIssuedAt: new Date() }
      });
      return ok({ registration });
    }

    if (data.action === "STATUS") {
      const registration = await prisma.eventRegistration.update({
        where: { id: data.registrationId },
        data: { status: data.status }
      });
      if (registration.userId) {
        await createNotification({
          userId: registration.userId,
          type: "EVENT_TICKET_STATUS",
          title: `Event registration is ${registration.status.toLowerCase().replaceAll("_", " ")}`,
          href: "/dashboard/operations?tab=events"
        });
      }
      return ok({ registration });
    }

    throw new ApiError(422, "Unsupported ticketing action.");
  } catch (error) {
    return handleRouteError(error);
  }
}
