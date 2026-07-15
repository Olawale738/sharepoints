import { CalendarConflictStatus, GrowthPriority, PrayerAssignmentStatus } from "@prisma/client";
import { z } from "zod";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import {
  activateEmergencySuccession,
  createExternalGuest,
  createPrayerAssignment,
  createPresidentDelegation,
  hasAnyActivePresidentDelegation,
  listExecutiveOperationsCenter,
  requirePresidentOrDelegation,
  revokeExternalGuest,
  revokePresidentDelegation,
  runSystemAccessCleanup,
  scanCalendarConflicts,
  updateCalendarConflict,
  updatePrayerAssignment
} from "@/lib/executive-operations";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export const runtime = "nodejs";

const optionalCuid = z.string().cuid().nullable().optional();
const optionalDate = z.string().datetime().nullable().optional();

const postSchema = z.discriminatedUnion("entity", [
  z.object({
    entity: z.literal("PRAYER_ASSIGNMENT"),
    title: z.string().trim().min(2).max(180),
    prayerPoint: z.string().trim().min(5).max(12000),
    category: z.string().trim().max(100).nullable().optional(),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).default("NORMAL"),
    workspaceId: optionalCuid,
    organizationUnitId: optionalCuid,
    departmentId: optionalCuid,
    assignedToUserId: optionalCuid,
    assignedWorkspaceId: optionalCuid,
    assignedOrganizationUnitId: optionalCuid,
    assignedDepartmentId: optionalCuid,
    dueAt: optionalDate
  }),
  z.object({ entity: z.literal("CALENDAR_SCAN") }),
  z.object({
    entity: z.literal("EXTERNAL_GUEST"),
    name: z.string().trim().min(2).max(160),
    email: z.string().email(),
    organization: z.string().trim().max(160).nullable().optional(),
    guestType: z.string().trim().min(2).max(80).default("PARTNER"),
    purpose: z.string().trim().min(5).max(4000),
    workspaceId: optionalCuid,
    fileId: optionalCuid,
    expiresAt: z.string().datetime()
  }),
  z.object({
    entity: z.literal("PRESIDENT_DELEGATION"),
    delegatedToId: z.string().cuid(),
    startsAt: optionalDate,
    expiresAt: z.string().datetime(),
    canIssueCertificates: z.boolean().default(false),
    canIssueIdCards: z.boolean().default(false),
    canIssueLetters: z.boolean().default(false),
    canManagePrayerAssignments: z.boolean().default(false),
    canResolveCalendarConflicts: z.boolean().default(false),
    canManageExternalGuests: z.boolean().default(false),
    canRunSystemCleanup: z.boolean().default(false),
    canEmergencySuccession: z.boolean().default(false),
    emergencyOnly: z.boolean().default(false),
    reason: z.string().trim().max(2000).nullable().optional()
  }),
  z.object({ entity: z.literal("SYSTEM_CLEANUP"), confirmation: z.literal("CLEAN STALE ACCESS") })
]);

const patchSchema = z.discriminatedUnion("entity", [
  z.object({
    entity: z.literal("PRAYER_ASSIGNMENT"),
    id: z.string().cuid(),
    status: z.enum(["ASSIGNED", "IN_PROGRESS", "COMPLETED", "TESTIMONY_RECORDED", "CANCELLED"]).optional(),
    completionNotes: z.string().trim().max(8000).nullable().optional(),
    testimony: z.string().trim().max(8000).nullable().optional()
  }),
  z.object({
    entity: z.literal("CALENDAR_CONFLICT"),
    id: z.string().cuid(),
    status: z.enum(["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"])
  }),
  z.object({
    entity: z.literal("PRESIDENT_DELEGATION_ACTIVATE"),
    id: z.string().cuid(),
    reason: z.string().trim().min(5).max(2000)
  })
]);

const deleteSchema = z.discriminatedUnion("entity", [
  z.object({ entity: z.literal("PRAYER_ASSIGNMENT"), id: z.string().cuid() }),
  z.object({ entity: z.literal("CALENDAR_CONFLICT"), id: z.string().cuid() }),
  z.object({ entity: z.literal("EXTERNAL_GUEST"), id: z.string().cuid(), mode: z.enum(["REVOKE", "DELETE"]).default("REVOKE") }),
  z.object({ entity: z.literal("PRESIDENT_DELEGATION"), id: z.string().cuid() })
]);

function dateOrNull(value?: string | null) {
  return value ? new Date(value) : null;
}

async function ensureExecutiveAccess(userId: string) {
  if ((await hasAnyWorkspaceAdminRole(userId)) || (await hasAnyActivePresidentDelegation(userId))) return;
  throw new ApiError(403, "Only admins or president-delegated leaders can open executive operations.");
}

async function ensureActionAccess(userId: string, permission: Parameters<typeof requirePresidentOrDelegation>[1], message: string) {
  if (await hasAnyWorkspaceAdminRole(userId)) return;
  await requirePresidentOrDelegation(userId, permission, message);
}

export async function GET() {
  try {
    const user = await requireUser();
    await ensureExecutiveAccess(user.id);
    const center = await listExecutiveOperationsCenter();
    return ok({ ...center, currentUserId: user.id });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await ensureExecutiveAccess(user.id);
    const data = postSchema.parse(await request.json());

    if (data.entity === "PRAYER_ASSIGNMENT") {
      await ensureActionAccess(user.id, "canManagePrayerAssignments", "You cannot manage prayer assignments.");
      const assignment = await createPrayerAssignment(user.id, {
        ...data,
        priority: data.priority as GrowthPriority,
        dueAt: dateOrNull(data.dueAt)
      });
      return ok({ assignment }, { status: 201 });
    }

    if (data.entity === "CALENDAR_SCAN") {
      await ensureActionAccess(user.id, "canResolveCalendarConflicts", "You cannot run calendar intelligence.");
      return ok(await scanCalendarConflicts(user.id));
    }

    if (data.entity === "EXTERNAL_GUEST") {
      await ensureActionAccess(user.id, "canManageExternalGuests", "You cannot manage external guests.");
      const result = await createExternalGuest(user.id, { ...data, expiresAt: new Date(data.expiresAt) });
      return ok(result, { status: 201 });
    }

    if (data.entity === "PRESIDENT_DELEGATION") {
      const delegation = await createPresidentDelegation(user.id, {
        ...data,
        startsAt: dateOrNull(data.startsAt),
        expiresAt: new Date(data.expiresAt)
      });
      return ok({ delegation }, { status: 201 });
    }

    await ensureActionAccess(user.id, "canRunSystemCleanup", "You cannot run system cleanup.");
    return ok({ cleanup: await runSystemAccessCleanup(user.id) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    await ensureExecutiveAccess(user.id);
    const data = patchSchema.parse(await request.json());
    if (data.entity === "PRAYER_ASSIGNMENT") {
      await ensureActionAccess(user.id, "canManagePrayerAssignments", "You cannot manage prayer assignments.");
      const assignment = await updatePrayerAssignment(user.id, data.id, {
        status: data.status as PrayerAssignmentStatus | undefined,
        completionNotes: data.completionNotes,
        testimony: data.testimony
      });
      return ok({ assignment });
    }
    if (data.entity === "PRESIDENT_DELEGATION_ACTIVATE") {
      return ok({ delegation: await activateEmergencySuccession(user.id, data.id, data.reason) });
    }
    await ensureActionAccess(user.id, "canResolveCalendarConflicts", "You cannot resolve calendar conflicts.");
    const conflict = await updateCalendarConflict(user.id, data.id, data.status as CalendarConflictStatus);
    return ok({ conflict });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    await ensureExecutiveAccess(user.id);
    const data = deleteSchema.parse(await request.json());

    if (data.entity === "PRAYER_ASSIGNMENT") {
      await ensureActionAccess(user.id, "canManagePrayerAssignments", "You cannot manage prayer assignments.");
      const assignment = await prisma.prayerAssignment.delete({ where: { id: data.id } });
      await logActivity({ userId: user.id, workspaceId: assignment.workspaceId ?? undefined, action: activityActions.prayerAssignmentDeleted, targetId: data.id });
      return ok({ deleted: true });
    }

    if (data.entity === "CALENDAR_CONFLICT") {
      await ensureActionAccess(user.id, "canResolveCalendarConflicts", "You cannot resolve calendar conflicts.");
      await prisma.churchCalendarConflict.delete({ where: { id: data.id } });
      await logActivity({ userId: user.id, action: activityActions.calendarConflictUpdated, targetId: data.id, metadata: { deleted: true } });
      return ok({ deleted: true });
    }

    if (data.entity === "EXTERNAL_GUEST") {
      await ensureActionAccess(user.id, "canManageExternalGuests", "You cannot manage external guests.");
      if (data.mode === "DELETE") {
        const guest = await prisma.externalGuestAccess.delete({ where: { id: data.id } });
        await logActivity({ userId: user.id, workspaceId: guest.workspaceId ?? undefined, action: activityActions.externalGuestDeleted, targetId: data.id });
        return ok({ deleted: true });
      }
      return ok({ guest: await revokeExternalGuest(user.id, data.id) });
    }

    return ok({ delegation: await revokePresidentDelegation(user.id, data.id) });
  } catch (error) {
    return handleRouteError(error);
  }
}
