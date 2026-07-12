import {
  ConfidentialVaultRecordType,
  ConfidentialVaultStatus,
  LeadershipDecisionSource,
  LeadershipDecisionStatus,
  LeadershipHandoverStatus,
  MonthlyReportStatus,
  OfficialLetterStatus,
  OfficialLetterType
} from "@prisma/client";
import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import {
  createConfidentialVaultRecord,
  createLeadershipDecision,
  createLeadershipHandover,
  createOfficialLetter,
  clearMonthlyReportLogs,
  deleteMonthlyReport,
  deleteOfficialLetter,
  generateMonthlyReport,
  generateMonthlyReportPack,
  getLeadershipGovernanceData,
  updateConfidentialVaultStatus,
  updateLeadershipDecision,
  updateLeadershipHandover,
  updateMonthlyReportStatus,
  updateOfficialLetter
} from "@/lib/leadership-governance";

const nullableCuid = z.string().cuid().nullable().optional();
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const listInput = z.union([z.array(z.string()), z.string()]).nullable().optional();

const createSchema = z.discriminatedUnion("entity", [
  z.object({
    entity: z.literal("DECISION"),
    source: z.nativeEnum(LeadershipDecisionSource),
    title: z.string().trim().min(2).max(180),
    description: z.string().trim().min(2).max(20_000),
    meetingNotes: nullableText(20_000),
    attachments: listInput,
    responsibleUserId: nullableCuid,
    decidedById: nullableCuid,
    workspaceId: nullableCuid,
    organizationUnitId: nullableCuid,
    dueAt: z.string().datetime().nullable().optional()
  }),
  z.object({
    entity: z.literal("MONTHLY_REPORT"),
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2000).max(2100),
    workspaceId: nullableCuid,
    organizationUnitId: nullableCuid
  }),
  z.object({
    entity: z.literal("MONTHLY_REPORT_PACK"),
    month: z.coerce.number().int().min(1).max(12),
    year: z.coerce.number().int().min(2000).max(2100)
  }),
  z.object({
    entity: z.literal("VAULT_RECORD"),
    recordType: z.nativeEnum(ConfidentialVaultRecordType),
    title: z.string().trim().min(2).max(180),
    subjectName: z.string().trim().min(2).max(180),
    subjectUserId: nullableCuid,
    body: z.string().trim().min(2).max(40_000),
    prayerPoints: nullableText(20_000),
    assignedToId: nullableCuid,
    workspaceId: nullableCuid,
    organizationUnitId: nullableCuid
  }),
  z.object({
    entity: z.literal("HANDOVER"),
    fromLeaderId: z.string().cuid(),
    toLeaderId: nullableCuid,
    title: z.string().trim().min(2).max(180),
    reason: nullableText(10_000),
    duties: listInput,
    documents: listInput,
    passwordAssets: listInput,
    pendingTasks: listInput,
    branchRecords: listInput,
    workspaceId: nullableCuid,
    organizationUnitId: nullableCuid
  }),
  z.object({
    entity: z.literal("OFFICIAL_LETTER"),
    letterType: z.nativeEnum(OfficialLetterType),
    title: z.string().trim().min(2).max(180),
    recipientUserId: nullableCuid,
    recipientName: z.string().trim().min(2).max(180),
    recipientEmail: z.string().email().nullable().optional(),
    body: z.string().trim().min(2).max(40_000),
    signatureName: nullableText(120),
    workspaceId: nullableCuid,
    organizationUnitId: nullableCuid,
    issueNow: z.boolean().optional()
  })
]);

const updateSchema = z.discriminatedUnion("entity", [
  z.object({ entity: z.literal("DECISION"), id: z.string().cuid(), status: z.nativeEnum(LeadershipDecisionStatus) }),
  z.object({ entity: z.literal("MONTHLY_REPORT"), id: z.string().cuid(), status: z.nativeEnum(MonthlyReportStatus) }),
  z.object({ entity: z.literal("VAULT_RECORD"), id: z.string().cuid(), status: z.nativeEnum(ConfidentialVaultStatus) }),
  z.object({ entity: z.literal("HANDOVER"), id: z.string().cuid(), status: z.nativeEnum(LeadershipHandoverStatus) }),
  z.object({ entity: z.literal("OFFICIAL_LETTER"), id: z.string().cuid(), status: z.nativeEnum(OfficialLetterStatus) })
]);

const deleteSchema = z.discriminatedUnion("entity", [
  z.object({
    entity: z.literal("OFFICIAL_LETTER"),
    id: z.string().cuid()
  }),
  z.object({
    entity: z.literal("MONTHLY_REPORT"),
    id: z.string().cuid(),
    mode: z.enum(["DELETE", "CLEAR_LOGS"]).default("DELETE")
  })
]);

export async function GET() {
  try {
    const user = await requireUser();
    return ok(await getLeadershipGovernanceData(user.id));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid governance request.");
    const data = parsed.data;
    if (data.entity === "DECISION") return ok({ result: await createLeadershipDecision(user.id, data) }, { status: 201 });
    if (data.entity === "MONTHLY_REPORT") return ok({ result: await generateMonthlyReport(user.id, data) }, { status: 201 });
    if (data.entity === "MONTHLY_REPORT_PACK") return ok({ result: await generateMonthlyReportPack(user.id, data) }, { status: 201 });
    if (data.entity === "VAULT_RECORD") return ok({ result: await createConfidentialVaultRecord(user.id, data) }, { status: 201 });
    if (data.entity === "HANDOVER") return ok({ result: await createLeadershipHandover(user.id, data) }, { status: 201 });
    return ok({ result: await createOfficialLetter(user.id, data) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid governance update.");
    const data = parsed.data;
    if (data.entity === "DECISION") return ok({ result: await updateLeadershipDecision(user.id, data.id, data.status) });
    if (data.entity === "VAULT_RECORD") return ok({ result: await updateConfidentialVaultStatus(user.id, data.id, data.status) });
    if (data.entity === "HANDOVER") return ok({ result: await updateLeadershipHandover(user.id, data.id, data.status) });
    if (data.entity === "OFFICIAL_LETTER") return ok({ result: await updateOfficialLetter(user.id, data.id, data.status) });

    return ok({ result: await updateMonthlyReportStatus(user.id, data.id, data.status) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const parsed = deleteSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid governance delete request.");
    if (parsed.data.entity === "MONTHLY_REPORT") {
      return ok({
        result:
          parsed.data.mode === "CLEAR_LOGS"
            ? await clearMonthlyReportLogs(user.id, parsed.data.id)
            : await deleteMonthlyReport(user.id, parsed.data.id)
      });
    }
    return ok({ result: await deleteOfficialLetter(user.id, parsed.data.id) });
  } catch (error) {
    return handleRouteError(error);
  }
}
