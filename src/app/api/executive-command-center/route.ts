import {
  EvidenceVaultStatus,
  EvidenceVaultType,
  WhatsAppCommandStatus
} from "@prisma/client";
import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import {
  createConfidentialEvidence,
  createDigitalSignature,
  createWhatsAppAdminCommand,
  getExecutiveCommandCenterData,
  updateConfidentialEvidence,
  updateDigitalSignature,
  updateWhatsAppAdminCommand
} from "@/lib/executive-command-center";

const nullableCuid = z.string().cuid().nullable().optional();
const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const nullableUrl = z
  .union([z.string().url(), z.literal("")])
  .nullable()
  .optional()
  .transform((value) => value || null);

const createSchema = z.discriminatedUnion("entity", [
  z.object({
    entity: z.literal("WHATSAPP_COMMAND"),
    command: z.string().trim().min(2).max(2000)
  }),
  z.object({
    entity: z.literal("DIGITAL_SIGNATURE"),
    targetType: z.string().trim().min(2).max(80),
    targetId: z.string().trim().min(2).max(180),
    title: z.string().trim().min(2).max(180),
    signerId: nullableCuid,
    signerName: z.string().trim().min(2).max(160),
    signerEmail: z.string().email().nullable().optional()
  }),
  z.object({
    entity: z.literal("EVIDENCE"),
    evidenceType: z.nativeEnum(EvidenceVaultType),
    title: z.string().trim().min(2).max(180),
    subjectName: nullableText(160),
    summary: z.string().trim().min(2).max(30_000),
    sourceUrl: nullableUrl,
    workspaceId: nullableCuid,
    organizationUnitId: nullableCuid
  })
]);

const updateSchema = z.discriminatedUnion("entity", [
  z.object({
    entity: z.literal("WHATSAPP_COMMAND"),
    id: z.string().cuid(),
    status: z.nativeEnum(WhatsAppCommandStatus),
    resultSummary: nullableText(5000)
  }),
  z.object({
    entity: z.literal("DIGITAL_SIGNATURE"),
    id: z.string().cuid(),
    action: z.enum(["SIGN", "REVOKE"]),
    signatureName: nullableText(160)
  }),
  z.object({
    entity: z.literal("EVIDENCE"),
    id: z.string().cuid(),
    status: z.nativeEnum(EvidenceVaultStatus),
    legalHold: z.boolean().nullable().optional()
  })
]);

export async function GET() {
  try {
    const user = await requireUser();
    return ok(await getExecutiveCommandCenterData(user.id));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid executive request.");
    const data = parsed.data;
    if (data.entity === "WHATSAPP_COMMAND") return ok({ result: await createWhatsAppAdminCommand(user.id, data.command) }, { status: 201 });
    if (data.entity === "DIGITAL_SIGNATURE") return ok({ result: await createDigitalSignature(user.id, data) }, { status: 201 });
    return ok({ result: await createConfidentialEvidence(user.id, data) }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid executive update.");
    const data = parsed.data;
    if (data.entity === "WHATSAPP_COMMAND") {
      return ok({ result: await updateWhatsAppAdminCommand(user.id, data.id, data.status, data.resultSummary) });
    }
    if (data.entity === "DIGITAL_SIGNATURE") {
      return ok({ result: await updateDigitalSignature(user.id, data.id, data.action, request, data.signatureName) });
    }
    return ok({ result: await updateConfidentialEvidence(user.id, data.id, data.status, request, data.legalHold) });
  } catch (error) {
    return handleRouteError(error);
  }
}
