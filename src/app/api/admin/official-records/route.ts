import { OfficialCircularStatus, PastorTransferStatus } from "@prisma/client";
import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import {
  acknowledgeOfficialCircular,
  createOfficialCircular,
  createPastorTransferPosting,
  deleteOfficialCircular,
  deletePastorTransferPosting,
  getOfficialRecordsData,
  updateOfficialCircular,
  updatePastorTransferPosting
} from "@/lib/official-records";

export const runtime = "nodejs";

const nullableCuid = z.string().cuid().nullable().optional();
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const listInput = z.union([z.array(z.string()), z.string()]).nullable().optional();

const createSchema = z.discriminatedUnion("entity", [
  z.object({
    entity: z.literal("PASTOR_TRANSFER"),
    pastorUserId: z.string().cuid(),
    fromOrganizationUnitId: nullableCuid,
    toOrganizationUnitId: nullableCuid,
    fromWorkspaceId: nullableCuid,
    toWorkspaceId: nullableCuid,
    title: z.string().trim().min(2).max(180),
    reason: nullableText(10_000),
    effectiveAt: z.string().datetime(),
    handoverDueAt: z.string().datetime().nullable().optional(),
    handoverChecklist: listInput,
    housingNeeds: nullableText(10_000),
    resourceNeeds: nullableText(10_000),
    branchAssignmentHistory: listInput,
    issueNow: z.boolean().optional()
  }),
  z.object({
    entity: z.literal("CIRCULAR"),
    title: z.string().trim().min(2).max(180),
    summary: z.string().trim().min(2).max(10_000),
    body: z.string().trim().min(2).max(40_000),
    category: z.string().trim().min(2).max(80).nullable().optional(),
    audienceType: z.string().trim().min(2).max(80).nullable().optional(),
    audienceLabel: z.string().trim().min(2).max(180).nullable().optional(),
    workspaceId: nullableCuid,
    organizationUnitId: nullableCuid,
    expiresAt: z.string().datetime().nullable().optional(),
    requiresAcknowledgement: z.boolean().optional(),
    issueNow: z.boolean().optional()
  }),
  z.object({
    entity: z.literal("CIRCULAR_ACKNOWLEDGEMENT"),
    acknowledgementId: z.string().cuid(),
    note: nullableText(2000)
  })
]);

const updateSchema = z.discriminatedUnion("entity", [
  z.object({ entity: z.literal("PASTOR_TRANSFER"), id: z.string().cuid(), status: z.nativeEnum(PastorTransferStatus) }),
  z.object({ entity: z.literal("CIRCULAR"), id: z.string().cuid(), status: z.nativeEnum(OfficialCircularStatus) })
]);

const deleteSchema = z.discriminatedUnion("entity", [
  z.object({ entity: z.literal("PASTOR_TRANSFER"), id: z.string().cuid() }),
  z.object({ entity: z.literal("CIRCULAR"), id: z.string().cuid() })
]);

export async function GET() {
  try {
    const user = await requireUser();
    return ok(await getOfficialRecordsData(user.id));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid official record request.");
    const data = parsed.data;
    if (data.entity === "PASTOR_TRANSFER") return ok({ result: await createPastorTransferPosting(user.id, data) }, { status: 201 });
    if (data.entity === "CIRCULAR") return ok({ result: await createOfficialCircular(user.id, data) }, { status: 201 });
    return ok({ result: await acknowledgeOfficialCircular(user.id, data.acknowledgementId, data.note) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid official record update.");
    const data = parsed.data;
    if (data.entity === "PASTOR_TRANSFER") return ok({ result: await updatePastorTransferPosting(user.id, data.id, data.status) });
    return ok({ result: await updateOfficialCircular(user.id, data.id, data.status) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const parsed = deleteSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid official record delete request.");
    if (parsed.data.entity === "PASTOR_TRANSFER") return ok({ result: await deletePastorTransferPosting(user.id, parsed.data.id) });
    return ok({ result: await deleteOfficialCircular(user.id, parsed.data.id) });
  } catch (error) {
    return handleRouteError(error);
  }
}
