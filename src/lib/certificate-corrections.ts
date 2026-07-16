import "server-only";

import { randomUUID } from "node:crypto";
import type { MemberCertificationBadge, Prisma } from "@prisma/client";

import { ApiError } from "@/lib/api";
import { generateCertificateNumber, generateSealNumber } from "@/lib/certificate-security";
import { recordCertificateEvent, signStoredCertificate } from "@/lib/certificate-lifecycle";
import { prisma } from "@/lib/prisma";

export const CERTIFICATE_CORRECTION_TYPES = ["NAME", "DATE", "PHOTO", "LEVEL", "PROGRAM", "SIGNATURE", "OTHER"] as const;

export type CertificateCorrectionType = (typeof CERTIFICATE_CORRECTION_TYPES)[number];

export type CertificateCorrectionChanges = {
  recipientName?: string | null;
  completionDate?: string | null;
  recipientPhotoUrl?: string | null;
  educationLevel?: string | null;
  programName?: string | null;
  fieldOfStudy?: string | null;
  gradeOrHonors?: string | null;
  secondSignatoryName?: string | null;
  secondSignatoryTitle?: string | null;
  secondSignatorySignatureUrl?: string | null;
  signatureNote?: string | null;
};

const changeKeys = [
  "recipientName",
  "completionDate",
  "recipientPhotoUrl",
  "educationLevel",
  "programName",
  "fieldOfStudy",
  "gradeOrHonors",
  "secondSignatoryName",
  "secondSignatoryTitle",
  "secondSignatorySignatureUrl",
  "signatureNote"
] as const;

function cleanText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeCertificateCorrectionChanges(raw: CertificateCorrectionChanges) {
  const cleaned: CertificateCorrectionChanges = {};
  for (const key of changeKeys) {
    const text = cleanText(raw[key]);
    if (text) cleaned[key] = text;
  }
  return cleaned;
}

function changesRecord(value: Prisma.JsonValue): CertificateCorrectionChanges {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return normalizeCertificateCorrectionChanges({
    recipientName: cleanText(record.recipientName),
    completionDate: cleanText(record.completionDate),
    recipientPhotoUrl: cleanText(record.recipientPhotoUrl),
    educationLevel: cleanText(record.educationLevel),
    programName: cleanText(record.programName),
    fieldOfStudy: cleanText(record.fieldOfStudy),
    gradeOrHonors: cleanText(record.gradeOrHonors),
    secondSignatoryName: cleanText(record.secondSignatoryName),
    secondSignatoryTitle: cleanText(record.secondSignatoryTitle),
    secondSignatorySignatureUrl: cleanText(record.secondSignatorySignatureUrl),
    signatureNote: cleanText(record.signatureNote)
  });
}

function dateOrExisting(value: string | null | undefined, existing: Date | null) {
  if (!value) return existing;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? existing : date;
}

function replacementData(
  existing: MemberCertificationBadge,
  changes: CertificateCorrectionChanges,
  actorId: string,
  reason: string | null
): Prisma.MemberCertificationBadgeUncheckedCreateInput {
  const correctedLevel = changes.educationLevel ?? existing.educationLevel;
  const correctedProgram = changes.programName ?? existing.programName;
  const correctedTitle = existing.certificateCategory === "EDUCATION" && correctedLevel ? correctedLevel : existing.title;

  return {
    userId: existing.userId,
    academicCandidateId: existing.academicCandidateId,
    title: correctedTitle,
    issuer: existing.issuer,
    certificateCategory: existing.certificateCategory,
    recipientName: changes.recipientName ?? existing.recipientName,
    recipientEmail: existing.recipientEmail,
    recipientPhone: existing.recipientPhone,
    recipientPhotoUrl: changes.recipientPhotoUrl ?? existing.recipientPhotoUrl,
    recipientOrganization: existing.recipientOrganization,
    educationLevel: correctedLevel,
    programName: correctedProgram,
    fieldOfStudy: changes.fieldOfStudy ?? existing.fieldOfStudy,
    gradeOrHonors: changes.gradeOrHonors ?? existing.gradeOrHonors,
    studyMode: existing.studyMode,
    studyStartDate: existing.studyStartDate,
    studyEndDate: existing.studyEndDate,
    completionDate: dateOrExisting(changes.completionDate, existing.completionDate),
    customBody: existing.customBody,
    certificatePreset: existing.certificatePreset,
    templateStyle: existing.templateStyle,
    templateAccent: existing.templateAccent,
    sealStyle: existing.sealStyle,
    signatureLayout: existing.signatureLayout,
    watermarkStrength: existing.watermarkStrength,
    presidentSignatureUrl: existing.presidentSignatureUrl,
    secondSignatoryName: changes.secondSignatoryName ?? existing.secondSignatoryName,
    secondSignatoryTitle: changes.secondSignatoryTitle ?? existing.secondSignatoryTitle,
    secondSignatorySignatureUrl: changes.secondSignatorySignatureUrl ?? existing.secondSignatorySignatureUrl,
    spouseOneName: existing.spouseOneName,
    spouseOneEmail: existing.spouseOneEmail,
    spouseOnePhotoUrl: existing.spouseOnePhotoUrl,
    spouseTwoName: existing.spouseTwoName,
    spouseTwoEmail: existing.spouseTwoEmail,
    spouseTwoPhotoUrl: existing.spouseTwoPhotoUrl,
    marriageDate: existing.marriageDate,
    marriageLocation: existing.marriageLocation,
    officiantName: existing.officiantName,
    witnessOneName: existing.witnessOneName,
    witnessTwoName: existing.witnessTwoName,
    replacementOfId: existing.id,
    reissueReason: reason ?? "Certificate corrected through the LETW correction workflow.",
    certificateNumber: generateCertificateNumber(existing.certificateCategory),
    sealNumber: generateSealNumber(existing.certificateCategory),
    verifyToken: randomUUID(),
    status: "ACTIVE",
    issuedAt: new Date(),
    expiresAt: existing.expiresAt,
    createdById: actorId
  };
}

export async function createCertificateCorrectionRequest(input: {
  certificateId: string;
  academicCandidateId?: string | null;
  requesterId?: string | null;
  requesterName?: string | null;
  requesterEmail?: string | null;
  correctionType: CertificateCorrectionType;
  requestedChanges: CertificateCorrectionChanges;
  reason?: string | null;
}) {
  const changes = normalizeCertificateCorrectionChanges(input.requestedChanges);
  if (Object.keys(changes).length === 0) {
    throw new ApiError(422, "Enter the correction details before sending the request.");
  }

  const request = await prisma.certificateCorrectionRequest.create({
    data: {
      certificateId: input.certificateId,
      academicCandidateId: input.academicCandidateId ?? null,
      requesterId: input.requesterId ?? null,
      requesterName: input.requesterName ?? null,
      requesterEmail: input.requesterEmail?.toLowerCase() ?? null,
      correctionType: input.correctionType,
      requestedChanges: changes as Prisma.InputJsonValue,
      reason: input.reason?.trim() || null
    }
  });

  await recordCertificateEvent({
    certificateId: input.certificateId,
    actorId: input.requesterId ?? null,
    eventType: "CORRECTION_REQUESTED",
    summary: `${input.correctionType.toLowerCase()} correction requested.`,
    metadata: {
      correctionRequestId: request.id,
      requestedChanges: changes as Prisma.InputJsonValue
    }
  });

  return request;
}

export async function approveCertificateCorrectionRequest(input: {
  requestId: string;
  actorId: string;
  reviewNote?: string | null;
}) {
  const replacement = await prisma.$transaction(async (tx) => {
    const request = await tx.certificateCorrectionRequest.findUnique({ where: { id: input.requestId } });
    if (!request) throw new ApiError(404, "Certificate correction request not found.");
    if (request.status !== "PENDING") throw new ApiError(409, "This correction request has already been reviewed.");

    const existing = await tx.memberCertificationBadge.findUnique({ where: { id: request.certificateId } });
    if (!existing) throw new ApiError(404, "Certificate not found.");
    if (existing.status === "REPLACED") throw new ApiError(409, "This certificate has already been replaced.");
    if (existing.status === "REVOKED") throw new ApiError(409, "Revoked certificates must be restored before correction.");

    const changes = changesRecord(request.requestedChanges);
    const corrected = await tx.memberCertificationBadge.create({
      data: replacementData(existing, changes, input.actorId, request.reason)
    });

    await tx.memberCertificationBadge.update({
      where: { id: existing.id },
      data: {
        status: "REPLACED",
        replacedById: corrected.id,
        reissueReason: request.reason ?? "Corrected by approved certificate correction request."
      }
    });

    await tx.certificateCorrectionRequest.update({
      where: { id: request.id },
      data: {
        status: "APPROVED",
        reviewedById: input.actorId,
        reviewedAt: new Date(),
        reviewNote: input.reviewNote?.trim() || null,
        replacementCertificateId: corrected.id
      }
    });

    await tx.certificateEvent.create({
      data: {
        certificateId: existing.id,
        actorId: input.actorId,
        eventType: "REPLACED",
        summary: `Replaced by corrected certificate ${corrected.certificateNumber ?? corrected.id}.`,
        metadata: { correctionRequestId: request.id, replacementId: corrected.id }
      }
    });
    await tx.certificateEvent.create({
      data: {
        certificateId: corrected.id,
        actorId: input.actorId,
        eventType: "CORRECTION_APPROVED",
        summary: `Corrected replacement for ${existing.certificateNumber ?? existing.id}.`,
        metadata: { correctionRequestId: request.id, replacementOfId: existing.id, requestedChanges: changes as Prisma.InputJsonValue }
      }
    });

    return corrected;
  });

  return signStoredCertificate(replacement);
}

export async function rejectCertificateCorrectionRequest(input: {
  requestId: string;
  actorId: string;
  reviewNote?: string | null;
}) {
  const request = await prisma.certificateCorrectionRequest.findUnique({ where: { id: input.requestId } });
  if (!request) throw new ApiError(404, "Certificate correction request not found.");
  if (request.status !== "PENDING") throw new ApiError(409, "This correction request has already been reviewed.");

  const rejected = await prisma.certificateCorrectionRequest.update({
    where: { id: request.id },
    data: {
      status: "REJECTED",
      reviewedById: input.actorId,
      reviewedAt: new Date(),
      reviewNote: input.reviewNote?.trim() || null
    }
  });

  await recordCertificateEvent({
    certificateId: request.certificateId,
    actorId: input.actorId,
    eventType: "CORRECTION_REJECTED",
    summary: input.reviewNote?.trim() || "Certificate correction request rejected.",
    metadata: { correctionRequestId: request.id }
  });

  return rejected;
}
