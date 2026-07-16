import "server-only";

import { randomUUID } from "node:crypto";
import type { AcademicCandidate, MemberCertificationBadge, Prisma } from "@prisma/client";

import { ApiError } from "@/lib/api";
import { requireAcademicBoardApproval } from "@/lib/academic-operations";
import { generateCertificateNumber, generateSealNumber } from "@/lib/certificate-security";
import { recordCertificateEvent, signStoredCertificate } from "@/lib/certificate-lifecycle";
import { normalizeCertificateExpiry } from "@/lib/certificates";
import { prisma } from "@/lib/prisma";

export function academicClearanceStatus(candidate: Pick<AcademicCandidate, "feesCleared" | "coursesCompleted" | "rectorApproved" | "photoUploaded" | "nameVerified">) {
  return candidate.feesCleared && candidate.coursesCompleted && candidate.rectorApproved && candidate.photoUploaded && candidate.nameVerified
    ? "CLEARED"
    : "PENDING";
}

export function academicClearanceMissing(candidate: Pick<AcademicCandidate, "feesCleared" | "coursesCompleted" | "rectorApproved" | "photoUploaded" | "nameVerified">) {
  return [
    !candidate.feesCleared ? "fees cleared" : null,
    !candidate.coursesCompleted ? "courses completed" : null,
    !candidate.rectorApproved ? "rector approval" : null,
    !candidate.photoUploaded ? "photo uploaded" : null,
    !candidate.nameVerified ? "name verified" : null
  ].filter(Boolean) as string[];
}

export async function requireClearedAcademicCandidate(candidateId?: string | null, title?: string | null) {
  if (!candidateId) {
    throw new ApiError(422, "Select a cleared academic candidate before issuing a theology certificate.");
  }

  const candidate = await prisma.academicCandidate.findUnique({ where: { id: candidateId } });
  if (!candidate) throw new ApiError(404, "Academic candidate not found.");
  if (candidate.status !== "ACTIVE") throw new ApiError(409, "This academic candidate is not active.");

  const missing = academicClearanceMissing(candidate);
  if (missing.length) {
    throw new ApiError(409, `Academic clearance is incomplete: ${missing.join(", ")}.`);
  }
  await requireAcademicBoardApproval(candidate, title);

  return candidate;
}

export async function updateCandidateClearanceStatus(candidateId: string, reviewedById?: string | null) {
  const candidate = await prisma.academicCandidate.findUnique({ where: { id: candidateId } });
  if (!candidate) throw new ApiError(404, "Academic candidate not found.");
  const clearanceStatus = academicClearanceStatus(candidate);

  return prisma.academicCandidate.update({
    where: { id: candidateId },
    data: {
      clearanceStatus,
      reviewedById: reviewedById ?? undefined,
      reviewedAt: reviewedById ? new Date() : undefined
    }
  });
}

export type AcademicCertificateInput = {
  actorId: string;
  candidate: AcademicCandidate;
  title: string;
  issuer?: string | null;
  recipientName?: string | null;
  recipientEmail?: string | null;
  recipientPhone?: string | null;
  recipientPhotoUrl?: string | null;
  recipientOrganization?: string | null;
  educationLevel?: string | null;
  programName?: string | null;
  fieldOfStudy?: string | null;
  gradeOrHonors?: string | null;
  studyMode?: string | null;
  studyStartDate?: Date | null;
  studyEndDate?: Date | null;
  completionDate?: Date | null;
  customBody?: string | null;
  certificatePreset?: string | null;
  templateStyle?: string | null;
  templateAccent?: string | null;
  sealStyle?: string | null;
  signatureLayout?: string | null;
  watermarkStrength?: string | null;
  secondSignatoryName?: string | null;
  secondSignatoryTitle?: string | null;
  secondSignatorySignatureUrl?: string | null;
  certificateNumber?: string | null;
  expiresAt?: Date | string | null;
  status?: string;
};

export function academicCertificateCreateData(input: AcademicCertificateInput): Prisma.MemberCertificationBadgeUncheckedCreateInput {
  const candidate = input.candidate;
  const issuedAt = new Date();

  return {
    userId: candidate.userId ?? null,
    academicCandidateId: candidate.id,
    title: input.title,
    issuer: input.issuer || "Light Encounter Tabernacle Worldwide",
    certificateCategory: "EDUCATION",
    recipientName: input.recipientName ?? candidate.fullName,
    recipientEmail: input.recipientEmail ?? candidate.email,
    recipientPhone: input.recipientPhone ?? candidate.phone,
    recipientPhotoUrl: input.recipientPhotoUrl ?? candidate.photoUrl,
    recipientOrganization: input.recipientOrganization ?? candidate.organization,
    educationLevel: input.educationLevel ?? candidate.educationLevel,
    programName: input.programName ?? candidate.programName,
    fieldOfStudy: input.fieldOfStudy ?? candidate.fieldOfStudy,
    gradeOrHonors: input.gradeOrHonors ?? null,
    studyMode: input.studyMode ?? candidate.studyMode,
    studyStartDate: input.studyStartDate ?? candidate.admissionDate,
    studyEndDate: input.studyEndDate ?? candidate.graduationDate,
    completionDate: input.completionDate ?? candidate.graduationDate ?? issuedAt,
    customBody: input.customBody ?? null,
    certificatePreset: input.certificatePreset ?? "THEOLOGY_DEGREE",
    templateStyle: input.templateStyle ?? "ACADEMIC",
    templateAccent: input.templateAccent ?? "NAVY_GOLD",
    sealStyle: input.sealStyle ?? "EMBOSSED",
    signatureLayout: input.signatureLayout ?? "DUAL",
    watermarkStrength: input.watermarkStrength ?? "STANDARD",
    presidentSignatureUrl: null,
    secondSignatoryName: input.secondSignatoryName ?? "Rector",
    secondSignatoryTitle: input.secondSignatoryTitle ?? "Rector",
    secondSignatorySignatureUrl: input.secondSignatorySignatureUrl ?? null,
    certificateNumber: input.certificateNumber || generateCertificateNumber("EDUCATION"),
    sealNumber: generateSealNumber("EDUCATION"),
    verifyToken: randomUUID(),
    status: input.status ?? "ACTIVE",
    issuedAt,
    expiresAt: normalizeCertificateExpiry(input.expiresAt),
    createdById: input.actorId
  };
}

export async function createAcademicCertificate(input: AcademicCertificateInput) {
  if (input.status !== "DRAFT") {
    await requireClearedAcademicCandidate(input.candidate.id, input.title);
  }

  const certificate = await prisma.memberCertificationBadge.create({
    data: academicCertificateCreateData(input)
  });
  const signedCertificate = await signStoredCertificate(certificate as MemberCertificationBadge);
  await recordCertificateEvent({
    certificateId: signedCertificate.id,
    actorId: input.actorId,
    eventType: input.status === "DRAFT" ? "PREVIEW_CREATED" : "ISSUED",
    summary: input.status === "DRAFT" ? "Academic certificate preview draft created." : "Academic certificate issued.",
    metadata: {
      academicCandidateId: input.candidate.id,
      certificateNumber: signedCertificate.certificateNumber,
      clearanceStatus: input.candidate.clearanceStatus
    }
  });
  return signedCertificate;
}
