import { z } from "zod";

import { ApiError, ok, requireUser } from "@/lib/api";
import { handleAcademicOpsRouteError } from "@/lib/academic-ops-db";
import { generateMinistryLicenseNumber, LICENSE_TYPES } from "@/lib/academic-operations";
import { requireCertificateIssuer } from "@/lib/official-issuance";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const licenseSchema = z.object({
  userId: z.string().cuid().optional().nullable(),
  holderName: z.string().trim().min(2).max(180),
  holderEmail: z.string().trim().email().optional().nullable(),
  holderPhone: z.string().trim().max(60).optional().nullable(),
  licenseType: z.enum(LICENSE_TYPES),
  scope: z.string().trim().max(300).optional().nullable(),
  ministryId: z.string().cuid().optional().nullable(),
  workspaceId: z.string().cuid().optional().nullable(),
  organizationUnitId: z.string().cuid().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable(),
  renewalNote: z.string().trim().max(1200).optional().nullable()
});

const patchSchema = z.object({
  id: z.string().cuid(),
  action: z.enum(["RENEW", "REVOKE", "RESTORE", "EXPIRE", "DELETE"]),
  expiresAt: z.string().datetime().optional().nullable(),
  renewalNote: z.string().trim().max(1200).optional().nullable()
});

export async function GET() {
  try {
    const actor = await requireUser();
    await requireCertificateIssuer(actor.id);
    const [licenses, users, ministries, workspaces, units] = await Promise.all([
      prisma.ministryLicense.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 500 }),
      prisma.user.findMany({
        where: { deletedAt: null, accessRevokedAt: null },
        select: { id: true, name: true, email: true },
        orderBy: [{ name: "asc" }, { email: "asc" }],
        take: 1000
      }),
      prisma.ministry.findMany({ where: { active: true }, orderBy: { name: "asc" }, take: 500 }),
      prisma.workspace.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
      prisma.organizationUnit.findMany({ where: { active: true }, select: { id: true, name: true, type: true }, orderBy: [{ type: "asc" }, { name: "asc" }], take: 500 })
    ]);
    return ok({ licenses, users, ministries, workspaces, units });
  } catch (error) {
    return handleAcademicOpsRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    await requireCertificateIssuer(actor.id);
    const parsed = licenseSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid ministry license.");
    const data = parsed.data;
    const license = await prisma.ministryLicense.create({
      data: {
        userId: data.userId ?? null,
        holderName: data.holderName,
        holderEmail: data.holderEmail?.toLowerCase() ?? null,
        holderPhone: data.holderPhone ?? null,
        licenseType: data.licenseType,
        licenseNumber: generateMinistryLicenseNumber(data.licenseType),
        scope: data.scope ?? null,
        ministryId: data.ministryId ?? null,
        workspaceId: data.workspaceId ?? null,
        organizationUnitId: data.organizationUnitId ?? null,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        renewalNote: data.renewalNote ?? null,
        createdById: actor.id
      }
    });
    return ok({ license }, { status: 201 });
  } catch (error) {
    return handleAcademicOpsRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireUser();
    await requireCertificateIssuer(actor.id);
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, "Invalid license update.");
    const existing = await prisma.ministryLicense.findUnique({ where: { id: parsed.data.id } });
    if (!existing) throw new ApiError(404, "Ministry license not found.");

    if (parsed.data.action === "DELETE") {
      await prisma.ministryLicense.delete({ where: { id: existing.id } });
      return ok({ deleted: true });
    }
    if (parsed.data.action === "RENEW") {
      const renewed = await prisma.$transaction(async (tx) => {
        await tx.ministryLicense.update({ where: { id: existing.id }, data: { status: "RENEWED" } });
        return tx.ministryLicense.create({
          data: {
            userId: existing.userId,
            holderName: existing.holderName,
            holderEmail: existing.holderEmail,
            holderPhone: existing.holderPhone,
            licenseType: existing.licenseType,
            licenseNumber: generateMinistryLicenseNumber(existing.licenseType),
            scope: existing.scope,
            ministryId: existing.ministryId,
            workspaceId: existing.workspaceId,
            organizationUnitId: existing.organizationUnitId,
            expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : existing.expiresAt,
            renewedFromId: existing.id,
            renewalNote: parsed.data.renewalNote ?? "Renewed license.",
            createdById: actor.id
          }
        });
      });
      return ok({ license: renewed });
    }

    const license = await prisma.ministryLicense.update({
      where: { id: existing.id },
      data: parsed.data.action === "REVOKE"
        ? { status: "REVOKED", revokedAt: new Date(), revokedById: actor.id, renewalNote: parsed.data.renewalNote ?? existing.renewalNote }
        : parsed.data.action === "EXPIRE"
          ? { status: "EXPIRED", expiresAt: new Date(), renewalNote: parsed.data.renewalNote ?? existing.renewalNote }
          : { status: "ACTIVE", revokedAt: null, revokedById: null, renewalNote: parsed.data.renewalNote ?? existing.renewalNote }
    });
    return ok({ license });
  } catch (error) {
    return handleAcademicOpsRouteError(error);
  }
}
