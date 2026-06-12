import { NotificationPriority, VisitorJourneyStage } from "@prisma/client";
import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { createNotification } from "@/lib/notifications";
import { activeOrganizationUsers, requireOperationsManager } from "@/lib/operations";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  action: z.literal("CREATE"),
  journeyType: z.enum(["VISITOR", "NEW_CONVERT"]),
  firstName: z.string().trim().min(2).max(80),
  lastName: z.string().trim().min(2).max(80),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(40).optional().nullable(),
  source: z.string().trim().max(120).optional().nullable(),
  workspaceId: z.string().cuid().optional().nullable(),
  firstVisitAt: z.string().datetime().optional().nullable(),
  assignedToId: z.string().cuid().optional().nullable(),
  nextContactAt: z.string().datetime().optional().nullable()
});

const updateSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("UPDATE"),
    id: z.string().cuid(),
    stage: z.nativeEnum(VisitorJourneyStage).optional(),
    assignedToId: z.string().cuid().optional().nullable(),
    nextContactAt: z.string().datetime().optional().nullable(),
    reminderAt: z.string().datetime().optional().nullable(),
    membershipUserId: z.string().cuid().optional().nullable(),
    note: z.string().trim().max(1000).optional().nullable()
  }),
  z.object({
    action: z.literal("NOTE"),
    id: z.string().cuid(),
    noteType: z.enum(["GENERAL", "CALL", "COUNSELLING", "PRAYER", "ONBOARDING"]),
    content: z.string().trim().min(2).max(10_000),
    confidential: z.boolean().optional(),
    nextContactAt: z.string().datetime().optional().nullable()
  }),
  z.object({
    action: z.literal("CHECKLIST"),
    id: z.string().cuid(),
    checklist: z.record(z.boolean())
  })
]);

export async function GET() {
  try {
    const user = await requireUser();
    await requireOperationsManager(user.id);
    const [journeys, notes, histories, users] = await Promise.all([
      prisma.visitorJourney.findMany({ orderBy: { updatedAt: "desc" }, take: 300 }),
      prisma.visitorJourneyNote.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
      prisma.visitorStageHistory.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
      activeOrganizationUsers()
    ]);
    return ok({ journeys, notes, histories, users });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireOperationsManager(user.id);
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid registration.");
    const data = parsed.data;
    const journey = await prisma.visitorJourney.create({
      data: {
        journeyType: data.journeyType,
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email || null,
        phone: data.phone || null,
        source: data.source || null,
        workspaceId: data.workspaceId ?? null,
        firstVisitAt: data.firstVisitAt ? new Date(data.firstVisitAt) : null,
        assignedToId: data.assignedToId ?? null,
        nextContactAt: data.nextContactAt ? new Date(data.nextContactAt) : null,
        reminderAt: data.nextContactAt ? new Date(data.nextContactAt) : null,
        onboardingChecklist: {
          welcomeContact: false,
          counselling: false,
          foundationClass: false,
          departmentIntroduced: false,
          membershipCompleted: false
        },
        createdById: user.id
      }
    });
    await prisma.visitorStageHistory.create({
      data: {
        journeyId: journey.id,
        toStage: journey.stage,
        changedById: user.id,
        note: "Journey registered"
      }
    });
    if (journey.assignedToId) {
      await createNotification({
        userId: journey.assignedToId,
        workspaceId: journey.workspaceId,
        type: "VISITOR_ASSIGNED",
        title: `${journey.firstName} ${journey.lastName} was assigned to you`,
        body: `Next stage: ${journey.stage.toLowerCase().replaceAll("_", " ")}`,
        href: "/dashboard/operations?tab=visitors",
        priority: NotificationPriority.HIGH,
        deliverAt: journey.reminderAt
      });
    }
    return ok({ journey }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    await requireOperationsManager(user.id);
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid journey update.");
    const data = parsed.data;
    const existing = await prisma.visitorJourney.findUnique({ where: { id: data.id } });
    if (!existing) throw new ApiError(404, "Visitor journey not found.");

    if (data.action === "NOTE") {
      const note = await prisma.visitorJourneyNote.create({
        data: {
          journeyId: data.id,
          authorId: user.id,
          noteType: data.noteType,
          content: data.content,
          confidential: data.confidential ?? true,
          nextContactAt: data.nextContactAt ? new Date(data.nextContactAt) : null
        }
      });
      if (data.nextContactAt) {
        await prisma.visitorJourney.update({
          where: { id: data.id },
          data: {
            nextContactAt: new Date(data.nextContactAt),
            reminderAt: new Date(data.nextContactAt)
          }
        });
      }
      return ok({ note });
    }

    if (data.action === "CHECKLIST") {
      const automaticStage = data.checklist.membershipCompleted
        ? VisitorJourneyStage.COMPLETED
        : data.checklist.departmentIntroduced
          ? VisitorJourneyStage.MEMBERSHIP_ONBOARDING
          : data.checklist.foundationClass
            ? VisitorJourneyStage.FOUNDATION_CLASS
            : data.checklist.counselling
              ? VisitorJourneyStage.COUNSELLING
              : data.checklist.welcomeContact
                ? VisitorJourneyStage.CONTACTED
                : existing.stage;
      const journey = await prisma.$transaction(async (transaction) => {
        const updated = await transaction.visitorJourney.update({
          where: { id: data.id },
          data: { onboardingChecklist: data.checklist, stage: automaticStage }
        });
        if (automaticStage !== existing.stage) {
          await transaction.visitorStageHistory.create({
            data: {
              journeyId: data.id,
              fromStage: existing.stage,
              toStage: automaticStage,
              changedById: user.id,
              note: "Stage advanced automatically from onboarding checklist"
            }
          });
        }
        return updated;
      });
      return ok({ journey });
    }

    const journey = await prisma.$transaction(async (transaction) => {
      const updated = await transaction.visitorJourney.update({
        where: { id: data.id },
        data: {
          stage: data.stage,
          assignedToId: data.assignedToId,
          nextContactAt: data.nextContactAt === undefined ? undefined : data.nextContactAt ? new Date(data.nextContactAt) : null,
          reminderAt: data.reminderAt === undefined ? undefined : data.reminderAt ? new Date(data.reminderAt) : null,
          membershipUserId: data.membershipUserId
        }
      });
      if (data.stage && data.stage !== existing.stage) {
        await transaction.visitorStageHistory.create({
          data: {
            journeyId: data.id,
            fromStage: existing.stage,
            toStage: data.stage,
            changedById: user.id,
            note: data.note || null
          }
        });
      }
      return updated;
    });
    if (journey.assignedToId && journey.assignedToId !== existing.assignedToId) {
      await createNotification({
        userId: journey.assignedToId,
        workspaceId: journey.workspaceId,
        type: "VISITOR_ASSIGNED",
        title: `${journey.firstName} ${journey.lastName} was assigned to you`,
        href: "/dashboard/operations?tab=visitors",
        priority: NotificationPriority.HIGH,
        deliverAt: journey.reminderAt
      });
    }
    return ok({ journey });
  } catch (error) {
    return handleRouteError(error);
  }
}
