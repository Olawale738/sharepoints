import { z } from "zod";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

const createSchema = z.discriminatedUnion("entity", [
  z.object({
    entity: z.literal("BOARD_RECORD"),
    recordType: z.enum(["MINUTES", "RESOLUTION", "LEGAL", "FINANCE", "APPROVAL", "DOCUMENT"]),
    title: z.string().trim().min(2).max(180),
    body: z.string().trim().min(2).max(20_000),
    workspaceId: z.string().cuid().nullable().optional(),
    organizationUnitId: z.string().cuid().nullable().optional(),
    confidential: z.boolean().default(true)
  }),
  z.object({
    entity: z.literal("BOARD_DECISION"),
    recordId: z.string().cuid(),
    title: z.string().trim().min(2).max(180),
    outcome: z.string().trim().min(2).max(5000),
    ownerId: z.string().cuid().nullable().optional(),
    dueAt: z.string().datetime().nullable().optional()
  })
]);

const updateSchema = z.object({
  id: z.string().cuid(),
  status: z.enum(["DRAFT", "REVIEW", "APPROVED", "ARCHIVED"])
});

export async function GET() {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id, "Only administrators and board-approved leaders can open the private board portal.");
    const [records, decisions, users, units, workspaces] = await Promise.all([
      prisma.boardRecord.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 300 }),
      prisma.boardDecision.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
      prisma.user.findMany({ where: { deletedAt: null, suspendedAt: null, accessRevokedAt: null }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
      prisma.organizationUnit.findMany({ where: { active: true }, select: { id: true, name: true, type: true }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
      prisma.workspace.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    ]);
    return ok({ records, decisions, users, units, workspaces });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id, "Only administrators can create private board records.");
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid board request.");
    const data = parsed.data;
    if (data.entity === "BOARD_RECORD") {
      const record = await prisma.boardRecord.create({
        data: {
          recordType: data.recordType,
          title: data.title,
          body: data.body,
          workspaceId: data.workspaceId ?? null,
          organizationUnitId: data.organizationUnitId ?? null,
          confidential: data.confidential,
          createdById: user.id
        }
      });
      await logActivity({ userId: user.id, action: activityActions.boardRecordCreated, targetId: record.id, metadata: { recordType: record.recordType } });
      return ok({ record }, { status: 201 });
    }
    const decision = await prisma.boardDecision.create({
      data: {
        recordId: data.recordId,
        title: data.title,
        outcome: data.outcome,
        ownerId: data.ownerId ?? null,
        dueAt: data.dueAt ? new Date(data.dueAt) : null
      }
    });
    await logActivity({ userId: user.id, action: activityActions.boardRecordUpdated, targetId: data.recordId, metadata: { decisionId: decision.id } });
    return ok({ decision }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id, "Only administrators can update private board records.");
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, "Invalid board update.");
    const record = await prisma.boardRecord.update({
      where: { id: parsed.data.id },
      data: {
        status: parsed.data.status,
        approvedById: parsed.data.status === "APPROVED" ? user.id : undefined,
        approvedAt: parsed.data.status === "APPROVED" ? new Date() : undefined
      }
    });
    await logActivity({ userId: user.id, action: activityActions.boardRecordUpdated, targetId: record.id, metadata: { status: record.status } });
    return ok({ record });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id, "Only administrators can delete private board records.");
    const body = (await request.json().catch(() => null)) as { id?: string; confirmation?: string } | null;
    if (!body?.id || body.confirmation !== "DELETE BOARD RECORD") throw new ApiError(422, "Enter DELETE BOARD RECORD to delete.");
    await prisma.$transaction([
      prisma.boardDecision.deleteMany({ where: { recordId: body.id } }),
      prisma.boardRecord.delete({ where: { id: body.id } })
    ]);
    await logActivity({ userId: user.id, action: activityActions.boardRecordDeleted, targetId: body.id });
    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
