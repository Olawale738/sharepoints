import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { requireAcademicCertificateIssuer, requireCertificateIssuer } from "@/lib/official-issuance";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const createSchema = z.object({
  certificateId: z.string().cuid(),
  status: z.enum(["READY_FOR_PRINT", "PRINTED", "COLLECTED", "MAILED", "REPRINT_NEEDED", "DAMAGED", "UNCOLLECTED"]).default("READY_FOR_PRINT"),
  method: z.string().trim().max(80).optional().nullable(),
  trackingCode: z.string().trim().max(120).optional().nullable(),
  collectedBy: z.string().trim().max(160).optional().nullable(),
  notes: z.string().trim().max(1200).optional().nullable()
});

const patchSchema = createSchema.partial().extend({
  id: z.string().cuid()
});

async function requireCertificatePrintAuthority(actorId: string, certificateId: string) {
  const certificate = await prisma.memberCertificationBadge.findUnique({ where: { id: certificateId } });
  if (!certificate) throw new ApiError(404, "Certificate not found.");
  if (certificate.certificateCategory === "EDUCATION") {
    await requireAcademicCertificateIssuer(actorId);
  } else {
    await requireCertificateIssuer(actorId);
  }
  return certificate;
}

export async function GET() {
  try {
    const actor = await requireUser();
    await requireCertificateIssuer(actor.id).catch(() => requireAcademicCertificateIssuer(actor.id));
    const [logs, certificates] = await Promise.all([
      prisma.certificatePrintLog.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
      prisma.memberCertificationBadge.findMany({
        orderBy: { issuedAt: "desc" },
        take: 500,
        select: { id: true, title: true, certificateNumber: true, certificateCategory: true, recipientName: true, recipientEmail: true, status: true }
      })
    ]);
    return ok({ logs, certificates });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid print log.");
    await requireCertificatePrintAuthority(actor.id, parsed.data.certificateId);
    const log = await prisma.certificatePrintLog.create({
      data: {
        certificateId: parsed.data.certificateId,
        status: parsed.data.status,
        method: parsed.data.method?.trim() || null,
        trackingCode: parsed.data.trackingCode?.trim() || null,
        collectedBy: parsed.data.collectedBy?.trim() || null,
        notes: parsed.data.notes?.trim() || null,
        handledById: parsed.data.status === "READY_FOR_PRINT" ? null : actor.id,
        handledAt: parsed.data.status === "READY_FOR_PRINT" ? null : new Date(),
        createdById: actor.id
      }
    });
    return ok({ log }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireUser();
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid print log update.");
    const existing = await prisma.certificatePrintLog.findUnique({ where: { id: parsed.data.id } });
    if (!existing) throw new ApiError(404, "Print log not found.");
    await requireCertificatePrintAuthority(actor.id, existing.certificateId);
    const log = await prisma.certificatePrintLog.update({
      where: { id: existing.id },
      data: {
        status: parsed.data.status,
        method: parsed.data.method === undefined ? undefined : parsed.data.method?.trim() || null,
        trackingCode: parsed.data.trackingCode === undefined ? undefined : parsed.data.trackingCode?.trim() || null,
        collectedBy: parsed.data.collectedBy === undefined ? undefined : parsed.data.collectedBy?.trim() || null,
        notes: parsed.data.notes === undefined ? undefined : parsed.data.notes?.trim() || null,
        handledById: parsed.data.status ? actor.id : undefined,
        handledAt: parsed.data.status ? new Date() : undefined
      }
    });
    return ok({ log });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireUser();
    const { id } = z.object({ id: z.string().cuid() }).parse(await request.json());
    const existing = await prisma.certificatePrintLog.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Print log not found.");
    await requireCertificatePrintAuthority(actor.id, existing.certificateId);
    await prisma.certificatePrintLog.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
