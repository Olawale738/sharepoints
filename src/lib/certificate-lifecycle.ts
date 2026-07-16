import "server-only";

import { randomUUID } from "node:crypto";
import type { MemberCertificationBadge, Prisma } from "@prisma/client";

import { certificateCredentialHash, generateCertificateNumber, generateSealNumber, signCertificate } from "@/lib/certificate-security";
import { prisma } from "@/lib/prisma";

export async function signStoredCertificate(certificate: MemberCertificationBadge) {
  return prisma.memberCertificationBadge.update({
    where: { id: certificate.id },
    data: {
      digitalSignature: signCertificate(certificate),
      credentialHash: certificateCredentialHash(certificate)
    }
  });
}

export async function recordCertificateEvent(input: {
  certificateId: string;
  actorId?: string | null;
  eventType: string;
  summary?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  return prisma.certificateEvent.create({
    data: {
      certificateId: input.certificateId,
      actorId: input.actorId ?? null,
      eventType: input.eventType,
      summary: input.summary ?? null,
      metadata: input.metadata ?? undefined,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null
    }
  });
}

export async function reissueCertificate(input: {
  certificateId: string;
  actorId: string;
  reason: string;
}) {
  const existing = await prisma.memberCertificationBadge.findUnique({ where: { id: input.certificateId } });
  if (!existing) return null;

  const now = new Date();
  const created = await prisma.$transaction(async (tx) => {
    const replacement = await tx.memberCertificationBadge.create({
      data: {
        userId: existing.userId,
        title: existing.title,
        issuer: existing.issuer,
        certificateCategory: existing.certificateCategory,
        recipientName: existing.recipientName,
        recipientEmail: existing.recipientEmail,
        recipientPhone: existing.recipientPhone,
        recipientPhotoUrl: existing.recipientPhotoUrl,
        recipientOrganization: existing.recipientOrganization,
        educationLevel: existing.educationLevel,
        programName: existing.programName,
        fieldOfStudy: existing.fieldOfStudy,
        gradeOrHonors: existing.gradeOrHonors,
        studyMode: existing.studyMode,
        studyStartDate: existing.studyStartDate,
        studyEndDate: existing.studyEndDate,
        completionDate: existing.completionDate,
        customBody: existing.customBody,
        certificatePreset: existing.certificatePreset,
        templateStyle: existing.templateStyle,
        templateAccent: existing.templateAccent,
        sealStyle: existing.sealStyle,
        signatureLayout: existing.signatureLayout,
        watermarkStrength: existing.watermarkStrength,
        presidentSignatureUrl: existing.presidentSignatureUrl,
        secondSignatoryName: existing.secondSignatoryName,
        secondSignatoryTitle: existing.secondSignatoryTitle,
        secondSignatorySignatureUrl: existing.secondSignatorySignatureUrl,
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
        reissueReason: input.reason,
        certificateNumber: generateCertificateNumber(existing.certificateCategory),
        sealNumber: generateSealNumber(existing.certificateCategory),
        verifyToken: randomUUID(),
        status: "ACTIVE",
        issuedAt: now,
        expiresAt: existing.expiresAt,
        createdById: input.actorId
      }
    });
    await tx.memberCertificationBadge.update({
      where: { id: existing.id },
      data: {
        status: "REPLACED",
        replacedById: replacement.id,
        reissueReason: input.reason
      }
    });
    await tx.certificateEvent.create({
      data: {
        certificateId: existing.id,
        actorId: input.actorId,
        eventType: "REPLACED",
        summary: `Replaced by ${replacement.certificateNumber ?? replacement.id}.`,
        metadata: { replacementId: replacement.id, reason: input.reason }
      }
    });
    await tx.certificateEvent.create({
      data: {
        certificateId: replacement.id,
        actorId: input.actorId,
        eventType: "REISSUED",
        summary: `Reissued from ${existing.certificateNumber ?? existing.id}.`,
        metadata: { replacementOfId: existing.id, reason: input.reason }
      }
    });
    return replacement;
  });

  return signStoredCertificate(created);
}
