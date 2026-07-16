import { z } from "zod";

import { ApiError, ok, requireUser } from "@/lib/api";
import { handleAcademicOpsRouteError } from "@/lib/academic-ops-db";
import { requireAcademicCertificateIssuer } from "@/lib/official-issuance";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const createSchema = z.object({
  title: z.string().trim().min(3).max(180),
  programName: z.string().trim().max(180).optional().nullable(),
  educationLevel: z.string().trim().max(120).optional().nullable(),
  fieldOfStudy: z.string().trim().max(120).optional().nullable(),
  boardDate: z.string().datetime().optional().nullable(),
  candidateIds: z.array(z.string().cuid()).min(1),
  notes: z.string().trim().max(2000).optional().nullable(),
  submit: z.boolean().optional()
});

const patchSchema = z.object({
  id: z.string().cuid(),
  action: z.enum(["SUBMIT", "APPROVE", "REJECT"]),
  reviewNote: z.string().trim().max(2000).optional().nullable()
});

export async function GET() {
  try {
    const actor = await requireUser();
    await requireAcademicCertificateIssuer(actor.id);
    const [boards, boardCandidates, candidates] = await Promise.all([
      prisma.academicBoardApproval.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.academicBoardApprovalCandidate.findMany({ orderBy: { createdAt: "desc" }, take: 1000 }),
      prisma.academicCandidate.findMany({ orderBy: [{ clearanceStatus: "desc" }, { fullName: "asc" }], take: 1000 })
    ]);
    return ok({ boards, boardCandidates, candidates });
  } catch (error) {
    return handleAcademicOpsRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    await requireAcademicCertificateIssuer(actor.id);
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid graduation approval list.");
    const data = parsed.data;
    const candidateCount = await prisma.academicCandidate.count({ where: { id: { in: data.candidateIds } } });
    if (candidateCount !== data.candidateIds.length) throw new ApiError(404, "One or more academic candidates were not found.");

    const now = new Date();
    const board = await prisma.$transaction(async (tx) => {
      const created = await tx.academicBoardApproval.create({
        data: {
          title: data.title,
          programName: data.programName?.trim() || null,
          educationLevel: data.educationLevel?.trim() || null,
          fieldOfStudy: data.fieldOfStudy?.trim() || "Theology",
          boardDate: data.boardDate ? new Date(data.boardDate) : null,
          status: data.submit ? "PENDING" : "DRAFT",
          submittedById: actor.id,
          submittedAt: data.submit ? now : null,
          notes: data.notes?.trim() || null
        }
      });
      await tx.academicBoardApprovalCandidate.createMany({
        data: data.candidateIds.map((candidateId) => ({
          boardId: created.id,
          candidateId,
          status: "PENDING"
        })),
        skipDuplicates: true
      });
      return created;
    });

    return ok({ board }, { status: 201 });
  } catch (error) {
    return handleAcademicOpsRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireUser();
    await requireAcademicCertificateIssuer(actor.id);
    const parsed = patchSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, "Invalid academic board action.");
    const existing = await prisma.academicBoardApproval.findUnique({ where: { id: parsed.data.id } });
    if (!existing) throw new ApiError(404, "Academic board list not found.");
    const now = new Date();

    const status = parsed.data.action === "APPROVE" ? "APPROVED" : parsed.data.action === "REJECT" ? "REJECTED" : "PENDING";
    const board = await prisma.$transaction(async (tx) => {
      const updated = await tx.academicBoardApproval.update({
        where: { id: parsed.data.id },
        data: {
          status,
          submittedAt: parsed.data.action === "SUBMIT" ? now : existing.submittedAt ?? now,
          reviewedById: parsed.data.action === "SUBMIT" ? null : actor.id,
          reviewedAt: parsed.data.action === "SUBMIT" ? null : now,
          reviewNote: parsed.data.action === "SUBMIT" ? null : parsed.data.reviewNote?.trim() || null
        }
      });
      if (parsed.data.action !== "SUBMIT") {
        await tx.academicBoardApprovalCandidate.updateMany({
          where: { boardId: parsed.data.id },
          data: { status }
        });
      }
      return updated;
    });

    return ok({ board });
  } catch (error) {
    return handleAcademicOpsRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireUser();
    await requireAcademicCertificateIssuer(actor.id);
    const { id } = z.object({ id: z.string().cuid() }).parse(await request.json());
    await prisma.$transaction(async (tx) => {
      await tx.academicBoardApprovalCandidate.deleteMany({ where: { boardId: id } });
      await tx.academicBoardApproval.delete({ where: { id } });
    });
    return ok({ deleted: true });
  } catch (error) {
    return handleAcademicOpsRouteError(error);
  }
}
