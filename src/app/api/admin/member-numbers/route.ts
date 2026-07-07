import { z } from "zod";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

export const runtime = "nodejs";

const requestSchema = z.object({
  includeUnitCode: z.boolean().optional().default(true),
  scopeUnitId: z.string().cuid().optional().nullable(),
  dryRun: z.boolean().optional().default(false)
});

function normalizeCode(value?: string | null) {
  return (value ?? "LETW")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36) || "LETW";
}

function nextNumberForPrefix(prefix: string, usedNumbers: Set<string>, counters: Map<string, number>) {
  let next = (counters.get(prefix) ?? 0) + 1;
  let candidate = `${prefix}-${String(next).padStart(6, "0")}`;

  while (usedNumbers.has(candidate)) {
    next += 1;
    candidate = `${prefix}-${String(next).padStart(6, "0")}`;
  }

  counters.set(prefix, next);
  usedNumbers.add(candidate);
  return candidate;
}

function seedCounters(existingNumbers: string[]) {
  const counters = new Map<string, number>();

  for (const number of existingNumbers) {
    const match = /^(.*)-(\d{4,})$/.exec(number);
    if (!match) continue;
    const prefix = match[1];
    const value = Number(match[2]);
    counters.set(prefix, Math.max(counters.get(prefix) ?? 0, Number.isFinite(value) ? value : 0));
  }

  return counters;
}

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    await requireAnyWorkspaceAdmin(actor.id, "Only administrators can generate member numbers.");
    const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid member-number request.");
    }

    const data = parsed.data;
    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        accessRevokedAt: null,
        email: { endsWith: "@letw.org" },
        ...(data.scopeUnitId ? { memberProfile: { currentOrganizationUnitId: data.scopeUnitId } } : {})
      },
      select: {
        id: true,
        createdAt: true,
        memberProfile: {
          select: {
            id: true,
            membershipNumber: true,
            membershipStartedAt: true,
            currentOrganizationUnitId: true
          }
        }
      },
      orderBy: [{ createdAt: "asc" }]
    });
    const existingProfiles = await prisma.memberProfile.findMany({
      where: { membershipNumber: { not: null } },
      select: { membershipNumber: true }
    });
    const units = await prisma.organizationUnit.findMany({
      select: { id: true, code: true }
    });
    const unitCodeById = new Map(units.map((unit) => [unit.id, unit.code]));
    const usedNumbers = new Set(existingProfiles.map((profile) => profile.membershipNumber).filter((value): value is string => Boolean(value)));
    const counters = seedCounters(Array.from(usedNumbers));
    const assignments = users
      .filter((user) => !user.memberProfile?.membershipNumber)
      .map((user) => {
        const year = (user.memberProfile?.membershipStartedAt ?? user.createdAt).getUTCFullYear();
        const unitCode =
          data.includeUnitCode && user.memberProfile?.currentOrganizationUnitId
            ? normalizeCode(unitCodeById.get(user.memberProfile.currentOrganizationUnitId))
            : "LETW";
        const prefix = `${unitCode}-${year}`;
        return {
          userId: user.id,
          profileId: user.memberProfile?.id ?? null,
          membershipNumber: nextNumberForPrefix(prefix, usedNumbers, counters)
        };
      });

    if (!data.dryRun && assignments.length) {
      await prisma.$transaction(
        assignments.map((assignment) =>
          prisma.memberProfile.upsert({
            where: { userId: assignment.userId },
            update: { membershipNumber: assignment.membershipNumber },
            create: {
              userId: assignment.userId,
              membershipNumber: assignment.membershipNumber
            }
          })
        )
      );
      await logActivity({
        userId: actor.id,
        action: activityActions.memberProfileUpdated,
        metadata: {
          operation: "bulk_member_number_generation",
          count: assignments.length,
          includeUnitCode: data.includeUnitCode,
          scopeUnitId: data.scopeUnitId ?? null
        }
      });
    }

    return ok({
      assigned: data.dryRun ? 0 : assignments.length,
      preview: assignments.slice(0, 25),
      pending: assignments.length,
      dryRun: data.dryRun
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
