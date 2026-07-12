import {
  ApprovalStatus,
  EvidenceVaultStatus,
  EvidenceVaultType,
  MediaArchiveType,
  PresidentialActionPriority,
  PresidentialActionStatus,
  SermonResourceVisibility,
  WhatsAppCommandStatus
} from "@prisma/client";
import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import {
  askExecutiveSecretary,
  createConfidentialEvidence,
  createDigitalSignature,
  createMediaArchiveResource,
  createPresidentialAction,
  createWhatsAppAdminCommand,
  deleteMediaArchiveResource,
  deletePresidentialAction,
  getExecutiveCommandCenterData,
  updateConfidentialEvidence,
  updateDigitalSignature,
  updateMediaArchiveResource,
  updatePresidentialAction,
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
  }),
  z.object({
    entity: z.literal("PRESIDENTIAL_ACTION"),
    title: z.string().trim().min(2).max(180),
    description: z.string().trim().min(2).max(30_000),
    category: z.string().trim().max(80).nullable().optional(),
    priority: z.nativeEnum(PresidentialActionPriority).default(PresidentialActionPriority.HIGH),
    assignedToId: nullableCuid,
    dueAt: z.string().datetime().nullable().optional(),
    workspaceId: nullableCuid,
    organizationUnitId: nullableCuid,
    sourceType: nullableText(80),
    sourceId: nullableText(180)
  }),
  z.object({
    entity: z.literal("MEDIA_ARCHIVE"),
    workspaceId: nullableCuid,
    organizationUnitId: nullableCuid,
    title: z.string().trim().min(2).max(180),
    speaker: z.string().trim().min(2).max(160),
    scripture: nullableText(180),
    language: z.string().trim().min(2).max(12).default("en"),
    mediaType: z.nativeEnum(MediaArchiveType).default(MediaArchiveType.LINK),
    mediaUrl: nullableUrl,
    notes: nullableText(30_000),
    visibility: z.nativeEnum(SermonResourceVisibility).default(SermonResourceVisibility.MEMBERS),
    retentionLabel: nullableText(120),
    tags: z.array(z.string().trim().min(1).max(60)).default([])
  }),
  z.object({
    entity: z.literal("EXECUTIVE_SECRETARY"),
    prompt: z.string().trim().min(2).max(4000)
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
  }),
  z.object({
    entity: z.literal("PRESIDENTIAL_ACTION"),
    id: z.string().cuid(),
    status: z.nativeEnum(PresidentialActionStatus),
    assignedToId: nullableCuid,
    decisionNote: nullableText(10_000),
    dueAt: z.string().datetime().nullable().optional()
  }),
  z.object({
    entity: z.literal("MEDIA_ARCHIVE"),
    id: z.string().cuid(),
    approvalStatus: z.nativeEnum(ApprovalStatus).optional(),
    visibility: z.nativeEnum(SermonResourceVisibility).optional(),
    isFeatured: z.boolean().optional(),
    transcriptSummary: nullableText(20_000),
    transcript: nullableText(60_000)
  })
]);

const deleteSchema = z.discriminatedUnion("entity", [
  z.object({ entity: z.literal("PRESIDENTIAL_ACTION"), id: z.string().cuid() }),
  z.object({ entity: z.literal("MEDIA_ARCHIVE"), id: z.string().cuid() })
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
    if (data.entity === "EVIDENCE") return ok({ result: await createConfidentialEvidence(user.id, data) }, { status: 201 });
    if (data.entity === "PRESIDENTIAL_ACTION") return ok({ result: await createPresidentialAction(user.id, data) }, { status: 201 });
    if (data.entity === "MEDIA_ARCHIVE") return ok({ result: await createMediaArchiveResource(user.id, data) }, { status: 201 });
    return ok(await askExecutiveSecretary(user.id, data.prompt));
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
    if (data.entity === "EVIDENCE") {
      return ok({ result: await updateConfidentialEvidence(user.id, data.id, data.status, request, data.legalHold) });
    }
    if (data.entity === "PRESIDENTIAL_ACTION") {
      return ok({ result: await updatePresidentialAction(user.id, data.id, data) });
    }
    return ok({ result: await updateMediaArchiveResource(user.id, data.id, data) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const parsed = deleteSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid executive delete request.");
    if (parsed.data.entity === "PRESIDENTIAL_ACTION") {
      return ok({ result: await deletePresidentialAction(user.id, parsed.data.id) });
    }
    return ok({ result: await deleteMediaArchiveResource(user.id, parsed.data.id) });
  } catch (error) {
    return handleRouteError(error);
  }
}
