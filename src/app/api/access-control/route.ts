import { z } from "zod";

import { activityActions, logActivity } from "@/lib/activity";
import { hashAccessSecret } from "@/lib/access-control";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

const optionalCuid = z.string().cuid().nullable().optional();

const createSchema = z.discriminatedUnion("entity", [
  z.object({
    entity: z.literal("ACCESS_POINT"),
    name: z.string().trim().min(2).max(180),
    pointType: z.enum(["ENTRANCE", "DOOR", "ROOM", "DESK", "CABINET", "EQUIPMENT", "VEHICLE", "KEY_BOX", "COMPUTER", "OTHER"]),
    location: z.string().trim().max(180).nullable().optional(),
    description: z.string().trim().max(1000).nullable().optional(),
    workspaceId: optionalCuid,
    organizationUnitId: optionalCuid,
    resourceId: optionalCuid,
    requireLiveCard: z.coerce.boolean().default(true)
  }),
  z.object({
    entity: z.literal("ACCESS_RULE"),
    accessPointId: z.string().cuid(),
    subjectType: z.enum(["ALL_ACTIVE", "USER", "ROLE", "DEPARTMENT", "CATEGORY", "WORKSPACE", "ORGANIZATION_UNIT"]),
    subjectId: z.string().trim().max(120).nullable().optional(),
    role: z.string().trim().max(80).nullable().optional(),
    canAccess: z.coerce.boolean().default(true),
    priority: z.coerce.number().int().min(1).max(10000).default(100),
    validFrom: z.string().datetime().nullable().optional(),
    validUntil: z.string().datetime().nullable().optional(),
    timeStart: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
    timeEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional()
  }),
  z.object({
    entity: z.literal("HARDWARE_DEVICE"),
    accessPointId: z.string().cuid(),
    name: z.string().trim().min(2).max(180),
    provider: z.string().trim().min(2).max(80).default("generic"),
    deviceIdentifier: z.string().trim().max(160).nullable().optional(),
    apiEndpoint: z.string().url().nullable().optional(),
    sharedSecret: z.string().trim().min(8).max(200).nullable().optional()
  })
]);

const updateSchema = z.discriminatedUnion("entity", [
  z.object({ entity: z.literal("ACCESS_POINT"), id: z.string().cuid(), active: z.coerce.boolean().optional(), requireLiveCard: z.coerce.boolean().optional() }),
  z.object({ entity: z.literal("ACCESS_RULE"), id: z.string().cuid(), canAccess: z.coerce.boolean().optional(), priority: z.coerce.number().int().min(1).max(10000).optional() }),
  z.object({ entity: z.literal("HARDWARE_DEVICE"), id: z.string().cuid(), active: z.coerce.boolean().optional() })
]);

const deleteSchema = z.discriminatedUnion("entity", [
  z.object({ entity: z.literal("ACCESS_POINT"), id: z.string().cuid() }),
  z.object({ entity: z.literal("ACCESS_RULE"), id: z.string().cuid() }),
  z.object({ entity: z.literal("HARDWARE_DEVICE"), id: z.string().cuid() }),
  z.object({ entity: z.literal("ACCESS_LOGS"), confirmation: z.literal("CLEAR ACCESS LOGS") })
]);

function dateOrNull(value?: string | null) {
  return value ? new Date(value) : null;
}

export async function GET() {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id, "Only administrators can open access control.");
    const [accessPoints, rules, devices, logs, users, workspaces, units, departments, resources] = await Promise.all([
      prisma.accessPoint.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }], take: 300 }),
      prisma.accessRule.findMany({ orderBy: [{ accessPointId: "asc" }, { priority: "asc" }], take: 1000 }),
      prisma.accessHardwareDevice.findMany({ orderBy: [{ active: "desc" }, { createdAt: "desc" }], take: 300 }),
      prisma.accessScanLog.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
      prisma.user.findMany({
        where: { deletedAt: null, suspendedAt: null, accessRevokedAt: null },
        select: { id: true, name: true, email: true, category: true, departmentId: true },
        orderBy: { name: "asc" },
        take: 1000
      }),
      prisma.workspace.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.organizationUnit.findMany({ where: { active: true }, select: { id: true, name: true, type: true }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
      prisma.department.findMany({ select: { id: true, name: true, kind: true }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
      prisma.churchResource.findMany({ where: { active: true }, select: { id: true, name: true, category: true }, orderBy: { name: "asc" } })
    ]);

    return ok({ accessPoints, rules, devices, logs, users, workspaces, units, departments, resources });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id, "Only administrators can configure access control.");
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid access-control request.");
    const data = parsed.data;
    let result: unknown;
    let action = "";

    if (data.entity === "ACCESS_POINT") {
      result = await prisma.accessPoint.create({
        data: {
          name: data.name,
          pointType: data.pointType,
          location: data.location ?? null,
          description: data.description ?? null,
          workspaceId: data.workspaceId ?? null,
          organizationUnitId: data.organizationUnitId ?? null,
          resourceId: data.resourceId ?? null,
          requireLiveCard: data.requireLiveCard,
          createdById: user.id
        }
      });
      action = activityActions.accessPointCreated;
    } else if (data.entity === "ACCESS_RULE") {
      result = await prisma.accessRule.create({
        data: {
          accessPointId: data.accessPointId,
          subjectType: data.subjectType,
          subjectId: data.subjectId || null,
          role: data.role || null,
          canAccess: data.canAccess,
          priority: data.priority,
          validFrom: dateOrNull(data.validFrom),
          validUntil: dateOrNull(data.validUntil),
          timeStart: data.timeStart ?? null,
          timeEnd: data.timeEnd ?? null,
          createdById: user.id
        }
      });
      action = activityActions.accessRuleCreated;
    } else {
      result = await prisma.accessHardwareDevice.create({
        data: {
          accessPointId: data.accessPointId,
          name: data.name,
          provider: data.provider,
          deviceIdentifier: data.deviceIdentifier ?? null,
          apiEndpoint: data.apiEndpoint ?? null,
          sharedSecretHash: data.sharedSecret ? hashAccessSecret(data.sharedSecret) : null,
          createdById: user.id
        }
      });
      action = activityActions.accessHardwareDeviceCreated;
    }

    await logActivity({
      userId: user.id,
      action,
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
    await requireAnyWorkspaceAdmin(user.id, "Only administrators can update access control.");
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid access-control update.");
    const data = parsed.data;
    let result: unknown;

    if (data.entity === "ACCESS_POINT") {
      result = await prisma.accessPoint.update({
        where: { id: data.id },
        data: { active: data.active, requireLiveCard: data.requireLiveCard }
      });
    } else if (data.entity === "ACCESS_RULE") {
      result = await prisma.accessRule.update({
        where: { id: data.id },
        data: { canAccess: data.canAccess, priority: data.priority }
      });
    } else {
      result = await prisma.accessHardwareDevice.update({
        where: { id: data.id },
        data: { active: data.active }
      });
    }

    await logActivity({
      userId: user.id,
      action: activityActions.accessControlUpdated,
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
    await requireAnyWorkspaceAdmin(user.id, "Only administrators can delete access-control records.");
    const parsed = deleteSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid delete request.");
    const data = parsed.data;

    if (data.entity === "ACCESS_LOGS") {
      const cleared = await prisma.accessScanLog.deleteMany({});
      await logActivity({
        userId: user.id,
        action: activityActions.accessLogsCleared,
        metadata: { clearedCount: cleared.count }
      });
      return ok({ cleared: true, count: cleared.count });
    }

    let cleanup: Record<string, number> = {};
    if (data.entity === "ACCESS_POINT") {
      cleanup = await prisma.$transaction(async (tx) => {
        const [rules, devices, logs] = await Promise.all([
          tx.accessRule.deleteMany({ where: { accessPointId: data.id } }),
          tx.accessHardwareDevice.deleteMany({ where: { accessPointId: data.id } }),
          tx.accessScanLog.deleteMany({ where: { accessPointId: data.id } })
        ]);
        await tx.accessPoint.delete({ where: { id: data.id } });
        return { rulesDeleted: rules.count, devicesDeleted: devices.count, logsDeleted: logs.count };
      });
    } else if (data.entity === "ACCESS_RULE") {
      await prisma.accessRule.delete({ where: { id: data.id } });
    } else {
      await prisma.accessHardwareDevice.delete({ where: { id: data.id } });
    }

    await logActivity({
      userId: user.id,
      action: activityActions.accessControlDeleted,
      targetId: data.id,
      metadata: { entity: data.entity, ...cleanup }
    });
    return ok({ deleted: true, entity: data.entity, id: data.id, cleanup });
  } catch (error) {
    return handleRouteError(error);
  }
}
