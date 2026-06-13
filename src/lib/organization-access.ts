import type { OrganizationUnit } from "@prisma/client";

import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

type UnitShape = Pick<OrganizationUnit, "id" | "parentId" | "type" | "name" | "active">;

function descendantIds(units: UnitShape[], rootId: string) {
  const children = new Map<string, string[]>();

  for (const unit of units) {
    if (!unit.parentId) continue;
    children.set(unit.parentId, [...(children.get(unit.parentId) ?? []), unit.id]);
  }

  const discovered = new Set<string>([rootId]);
  const queue = [rootId];

  while (queue.length) {
    const current = queue.shift();
    if (!current) break;
    for (const childId of children.get(current) ?? []) {
      if (discovered.has(childId)) continue;
      discovered.add(childId);
      queue.push(childId);
    }
  }

  return discovered;
}

export async function getOrganizationUnitAccess(userId: string) {
  const [isAdmin, units, assignments] = await Promise.all([
    hasAnyWorkspaceAdminRole(userId),
    prisma.organizationUnit.findMany({
      where: { active: true },
      orderBy: [{ type: "asc" }, { name: "asc" }]
    }),
    prisma.organizationUnitLeader.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" }
    })
  ]);

  if (isAdmin) {
    return {
      isAdmin,
      units,
      creatableUnitIds: new Set(units.map((unit) => unit.id)),
      visibleUnitIds: new Set(units.map((unit) => unit.id))
    };
  }

  const visibleUnitIds = new Set<string>();
  const creatableUnitIds = new Set<string>();

  for (const assignment of assignments) {
    const allowedIds = assignment.inheritToChildren
      ? descendantIds(units, assignment.unitId)
      : new Set([assignment.unitId]);
    for (const unitId of allowedIds) {
      visibleUnitIds.add(unitId);
      if (assignment.canCreateWorkspaces) creatableUnitIds.add(unitId);
    }
  }

  return {
    isAdmin,
    units: units.filter((unit) => visibleUnitIds.has(unit.id)),
    creatableUnitIds,
    visibleUnitIds
  };
}

export async function canCreateWorkspaceForUnit(userId: string, unitId: string) {
  const access = await getOrganizationUnitAccess(userId);
  return access.creatableUnitIds.has(unitId);
}

export async function requireWorkspaceUnitCreationAccess(userId: string, unitId: string) {
  const unit = await prisma.organizationUnit.findFirst({
    where: { id: unitId, active: true }
  });

  if (!unit) {
    throw new ApiError(404, "Organization scope not found.");
  }

  if (!(await canCreateWorkspaceForUnit(userId, unitId))) {
    throw new ApiError(403, "You cannot create a workspace in this country, region, church, or ministry.");
  }

  return unit;
}

export async function getOrganizationScopeUserIds(unitId: string) {
  const units = await prisma.organizationUnit.findMany({
    where: { active: true },
    select: { id: true, parentId: true, type: true, name: true, active: true }
  });
  const scopedIds = Array.from(descendantIds(units, unitId));
  const [members, leaders] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: {
        workspace: {
          deletedAt: null,
          organizationUnitId: { in: scopedIds }
        }
      },
      select: { userId: true }
    }),
    prisma.organizationUnitLeader.findMany({
      where: { unitId: { in: scopedIds } },
      select: { userId: true }
    })
  ]);

  return Array.from(new Set([...members, ...leaders].map((record) => record.userId)));
}

export async function getOrganizationAncestorIds(unitIds: string[]) {
  if (!unitIds.length) return [];
  const units = await prisma.organizationUnit.findMany({
    where: { active: true },
    select: { id: true, parentId: true }
  });
  const parentById = new Map(units.map((unit) => [unit.id, unit.parentId]));
  const discovered = new Set(unitIds);

  for (const unitId of unitIds) {
    let current = parentById.get(unitId);
    while (current) {
      if (discovered.has(current)) break;
      discovered.add(current);
      current = parentById.get(current);
    }
  }

  return Array.from(discovered);
}
