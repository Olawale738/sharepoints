import { randomUUID } from "crypto";
import { PresidentialApprovalTargetType } from "@prisma/client";
import { z } from "zod";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { createAcademicCertificate, requireClearedAcademicCandidate } from "@/lib/academic-certificates";
import { CERTIFICATE_PRESET_VALUES, certificatePresetDefaults, inferCertificatePreset } from "@/lib/certificate-presets";
import { generateCertificateNumber, generateSealNumber, THEOLOGY_CERTIFICATE_TYPES } from "@/lib/certificate-security";
import { recordCertificateEvent, signStoredCertificate } from "@/lib/certificate-lifecycle";
import { normalizeCertificateExpiry } from "@/lib/certificates";
import { getOfficialIssuanceAuthority, requireAcademicCertificateIssuer, requireCertificateIssuer } from "@/lib/official-issuance";
import { maybeQueuePresidentialApproval } from "@/lib/president-controls";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

const certificateImageRefSchema = z
  .string()
  .trim()
  .max(600)
  .refine((value) => value.startsWith("/api/certificates/assets/") || value.startsWith("https://") || value.startsWith("http://"), {
    message: "Certificate images must be uploaded in LETW or use a valid URL."
  });

const certificateSchema = z.object({
  userId: z.string().cuid().optional().nullable(),
  academicCandidateId: z.string().cuid().optional().nullable(),
  signatureProfileId: z.string().cuid().optional().nullable(),
  previewOnly: z.boolean().optional(),
  title: z.string().trim().min(3).max(160),
  certificateCategory: z.enum(["MINISTRY", "EDUCATION", "MARRIAGE"]).default("MINISTRY"),
  recipientName: z.string().trim().max(180).optional().nullable(),
  recipientEmail: z.string().trim().email().optional().nullable(),
  recipientPhone: z.string().trim().max(60).optional().nullable(),
  recipientPhotoUrl: certificateImageRefSchema.optional().nullable(),
  recipientOrganization: z.string().trim().max(180).optional().nullable(),
  educationLevel: z.string().trim().max(120).optional().nullable(),
  programName: z.string().trim().max(180).optional().nullable(),
  fieldOfStudy: z.string().trim().max(120).optional().nullable(),
  gradeOrHonors: z.string().trim().max(120).optional().nullable(),
  studyMode: z.string().trim().max(80).optional().nullable(),
  studyStartDate: z.string().datetime().optional().nullable(),
  studyEndDate: z.string().datetime().optional().nullable(),
  completionDate: z.string().datetime().optional().nullable(),
  customBody: z.string().trim().max(1200).optional().nullable(),
  certificatePreset: z.enum(CERTIFICATE_PRESET_VALUES).optional().nullable(),
  templateStyle: z.enum(["CLASSIC", "ACADEMIC", "MARRIAGE_ELEGANT", "MODERN", "ROYAL"]).optional().nullable(),
  templateAccent: z.enum(["NAVY_GOLD", "BLUE_GOLD", "BURGUNDY_GOLD", "GREEN_GOLD", "MONOCHROME"]).optional().nullable(),
  sealStyle: z.enum(["CHIP", "EMBOSSED", "ROUND", "SCRIPTURE"]).optional().nullable(),
  signatureLayout: z.enum(["DUAL", "PRESIDENT_LEFT", "PRESIDENT_RIGHT"]).optional().nullable(),
  watermarkStrength: z.enum(["SUBTLE", "STANDARD", "STRONG"]).optional().nullable(),
  presidentSignatureUrl: certificateImageRefSchema.optional().nullable(),
  secondSignatoryName: z.string().trim().max(160).optional().nullable(),
  secondSignatoryTitle: z.string().trim().max(120).optional().nullable(),
  secondSignatorySignatureUrl: certificateImageRefSchema.optional().nullable(),
  spouseOneName: z.string().trim().max(180).optional().nullable(),
  spouseOneEmail: z.string().trim().email().optional().nullable(),
  spouseOnePhotoUrl: certificateImageRefSchema.optional().nullable(),
  spouseTwoName: z.string().trim().max(180).optional().nullable(),
  spouseTwoEmail: z.string().trim().email().optional().nullable(),
  spouseTwoPhotoUrl: certificateImageRefSchema.optional().nullable(),
  marriageDate: z.string().datetime().optional().nullable(),
  marriageLocation: z.string().trim().max(220).optional().nullable(),
  officiantName: z.string().trim().max(160).optional().nullable(),
  witnessOneName: z.string().trim().max(160).optional().nullable(),
  witnessTwoName: z.string().trim().max(160).optional().nullable(),
  issuer: z.string().trim().min(2).max(160).optional(),
  certificateNumber: z.string().trim().min(3).max(80).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable()
});

function nullableDate(value?: string | null) {
  return value ? new Date(value) : null;
}

function normalizeNullableText(value?: string | null) {
  const text = value?.trim();
  return text || null;
}

export async function GET() {
  try {
    const user = await requireUser();
    const isAdmin = await hasAnyWorkspaceAdminRole(user.id);
    const authority = await getOfficialIssuanceAuthority(user.id);
    const canSeeRegistry = isAdmin || authority.canIssueCertificates || authority.canIssueAcademicCertificates;
    const academicOnly = authority.canIssueAcademicCertificates && !authority.canIssueCertificates && !isAdmin;
    const certificateRows = await prisma.memberCertificationBadge.findMany({
      where: canSeeRegistry ? (academicOnly ? { certificateCategory: "EDUCATION" } : undefined) : { userId: user.id },
      orderBy: { issuedAt: "desc" },
      take: canSeeRegistry ? 500 : 50
    });
    const certificateUsers = await prisma.user.findMany({
      where: {
        id: {
          in: Array.from(new Set(certificateRows.map((certificate) => certificate.userId).filter(Boolean))) as string[]
        }
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        memberProfile: {
          select: {
            membershipNumber: true,
            organizationPosition: true,
            phone: true
          }
        }
      }
    });
    const usersById = new Map(certificateUsers.map((certificateUser) => [certificateUser.id, certificateUser]));

    return ok({
      certificates: certificateRows.map((certificate) => ({
        ...certificate,
        user: certificate.userId ? usersById.get(certificate.userId) ?? {
          id: certificate.userId,
          name: null,
          email: null,
          image: null,
          memberProfile: null
        } : {
          id: null,
          name: certificate.recipientName,
          email: certificate.recipientEmail,
          image: certificate.recipientPhotoUrl,
          memberProfile: null
        }
      })),
      canManage: authority.canIssueCertificates || authority.canIssueAcademicCertificates,
      canManageAcademic: authority.canIssueAcademicCertificates,
      canManageMinistry: authority.canIssueCertificates
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    const parsed = certificateSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid certificate.");
    }

    const data = parsed.data;
    const normalizedTitle = normalizeNullableText(data.title) ?? "Membership Certificate";
    const isEducation = data.certificateCategory === "EDUCATION";
    if (isEducation) {
      await requireAcademicCertificateIssuer(actor.id);
    } else {
      await requireCertificateIssuer(actor.id);
    }
    const isMarriage = data.certificateCategory === "MARRIAGE";
    const academicCandidate = isEducation
      ? data.academicCandidateId
        ? await prisma.academicCandidate.findUnique({ where: { id: data.academicCandidateId } })
        : null
      : null;
    if (isEducation && !academicCandidate) {
      throw new ApiError(422, "Select an academic candidate from the student registry before creating a theology certificate.");
    }
    if (isEducation && academicCandidate && !data.previewOnly) {
      await requireClearedAcademicCandidate(academicCandidate.id);
    }
    const signatureProfile = data.signatureProfileId
      ? await prisma.certificateSignatureProfile.findFirst({
          where: { id: data.signatureProfileId, active: true }
        })
      : null;
    if (data.signatureProfileId && !signatureProfile) {
      throw new ApiError(404, "The selected signature profile is inactive or was not found.");
    }
    const certificatePreset = inferCertificatePreset({
      certificatePreset: data.certificatePreset,
      certificateCategory: data.certificateCategory,
      title: normalizedTitle
    });
    const presetDefaults = certificatePresetDefaults(certificatePreset);
    const marriageHolderName = isMarriage && data.spouseOneName && data.spouseTwoName ? `${data.spouseOneName} and ${data.spouseTwoName}` : null;
    const recipient = data.userId
      ? await prisma.user.findFirst({
          where: {
            id: data.userId,
            deletedAt: null,
            accessRevokedAt: null
          },
          select: { id: true, name: true, email: true }
        })
      : null;

    if (data.userId && !recipient) {
      throw new ApiError(404, "Recipient not found or inactive.");
    }
    if (isMarriage && (!normalizeNullableText(data.spouseOneName) || !normalizeNullableText(data.spouseTwoName))) {
      throw new ApiError(422, "Marriage certificates require both spouse names.");
    }
    if (!recipient && !academicCandidate && !normalizeNullableText(data.recipientName) && !marriageHolderName) {
      throw new ApiError(422, "Enter the external candidate name or select a LETW member.");
    }
    if (isEducation && !THEOLOGY_CERTIFICATE_TYPES.includes(normalizedTitle as (typeof THEOLOGY_CERTIFICATE_TYPES)[number]) && !normalizeNullableText(data.programName)) {
      throw new ApiError(422, "Educational certificates need a theology program name or one of the theology certificate levels.");
    }

    if (isEducation && academicCandidate && data.previewOnly) {
      const preview = await createAcademicCertificate({
        actorId: actor.id,
        candidate: academicCandidate,
        title: normalizedTitle,
        issuer: data.issuer,
        recipientName: normalizeNullableText(data.recipientName),
        recipientEmail: normalizeNullableText(data.recipientEmail),
        recipientPhone: normalizeNullableText(data.recipientPhone),
        recipientPhotoUrl: normalizeNullableText(data.recipientPhotoUrl),
        recipientOrganization: normalizeNullableText(data.recipientOrganization),
        educationLevel: normalizeNullableText(data.educationLevel) ?? normalizedTitle,
        programName: normalizeNullableText(data.programName) ?? normalizedTitle,
        fieldOfStudy: normalizeNullableText(data.fieldOfStudy) ?? "Theology",
        gradeOrHonors: normalizeNullableText(data.gradeOrHonors),
        studyMode: normalizeNullableText(data.studyMode),
        studyStartDate: nullableDate(data.studyStartDate),
        studyEndDate: nullableDate(data.studyEndDate),
        completionDate: nullableDate(data.completionDate),
        customBody: normalizeNullableText(data.customBody),
        certificatePreset,
        templateStyle: data.templateStyle ?? presetDefaults.templateStyle,
        templateAccent: data.templateAccent ?? presetDefaults.templateAccent,
        sealStyle: data.sealStyle ?? presetDefaults.sealStyle,
        signatureLayout: data.signatureLayout ?? presetDefaults.signatureLayout,
        watermarkStrength: data.watermarkStrength ?? presetDefaults.watermarkStrength,
        secondSignatoryName: normalizeNullableText(data.secondSignatoryName) ?? signatureProfile?.name ?? null,
        secondSignatoryTitle: normalizeNullableText(data.secondSignatoryTitle) ?? signatureProfile?.title ?? presetDefaults.secondSignatoryTitle,
        secondSignatorySignatureUrl: normalizeNullableText(data.secondSignatorySignatureUrl) ?? signatureProfile?.imageUrl ?? null,
        certificateNumber: data.certificateNumber ?? null,
        expiresAt: data.expiresAt ?? null,
        status: "DRAFT"
      });

      return ok({ certificate: preview, preview: true }, { status: 201 });
    }

    const pendingApproval = await maybeQueuePresidentialApproval({
      requesterId: actor.id,
      targetType: PresidentialApprovalTargetType.CERTIFICATE,
      targetId: recipient?.id ?? null,
      title: `Certificate approval: ${normalizedTitle}`,
      summary: `Approve issuing ${normalizedTitle} to ${recipient?.name ?? data.recipientName ?? data.recipientEmail ?? "external candidate"}.`,
      payload: {
        userId: recipient?.id ?? null,
        academicCandidateId: academicCandidate?.id ?? null,
        title: normalizedTitle,
        certificateCategory: data.certificateCategory,
        recipientName: normalizeNullableText(data.recipientName) ?? marriageHolderName ?? recipient?.name ?? academicCandidate?.fullName ?? null,
        recipientEmail: normalizeNullableText(data.recipientEmail) ?? recipient?.email ?? academicCandidate?.email ?? null,
        recipientPhone: normalizeNullableText(data.recipientPhone) ?? academicCandidate?.phone ?? null,
        recipientPhotoUrl: normalizeNullableText(data.recipientPhotoUrl) ?? academicCandidate?.photoUrl ?? null,
        recipientOrganization: normalizeNullableText(data.recipientOrganization) ?? academicCandidate?.organization ?? null,
        educationLevel: normalizeNullableText(data.educationLevel) ?? (isEducation ? normalizedTitle : null) ?? academicCandidate?.educationLevel ?? null,
        programName: normalizeNullableText(data.programName) ?? (isEducation ? normalizedTitle : null) ?? academicCandidate?.programName ?? null,
        fieldOfStudy: normalizeNullableText(data.fieldOfStudy) ?? (isEducation ? "Theology" : null) ?? academicCandidate?.fieldOfStudy ?? null,
        gradeOrHonors: normalizeNullableText(data.gradeOrHonors),
        studyMode: normalizeNullableText(data.studyMode),
        studyStartDate: data.studyStartDate ?? null,
        studyEndDate: data.studyEndDate ?? null,
        completionDate: data.completionDate ?? null,
        customBody: normalizeNullableText(data.customBody),
        certificatePreset,
        templateStyle: data.templateStyle ?? presetDefaults.templateStyle,
        templateAccent: data.templateAccent ?? presetDefaults.templateAccent,
        sealStyle: data.sealStyle ?? presetDefaults.sealStyle,
        signatureLayout: data.signatureLayout ?? presetDefaults.signatureLayout,
        watermarkStrength: data.watermarkStrength ?? presetDefaults.watermarkStrength,
        presidentSignatureUrl: isEducation ? null : normalizeNullableText(data.presidentSignatureUrl),
        secondSignatoryName: normalizeNullableText(data.secondSignatoryName) ?? signatureProfile?.name ?? null,
        secondSignatoryTitle: normalizeNullableText(data.secondSignatoryTitle) ?? signatureProfile?.title ?? presetDefaults.secondSignatoryTitle,
        secondSignatorySignatureUrl: normalizeNullableText(data.secondSignatorySignatureUrl) ?? signatureProfile?.imageUrl ?? null,
        spouseOneName: normalizeNullableText(data.spouseOneName),
        spouseOneEmail: normalizeNullableText(data.spouseOneEmail),
        spouseOnePhotoUrl: normalizeNullableText(data.spouseOnePhotoUrl),
        spouseTwoName: normalizeNullableText(data.spouseTwoName),
        spouseTwoEmail: normalizeNullableText(data.spouseTwoEmail),
        spouseTwoPhotoUrl: normalizeNullableText(data.spouseTwoPhotoUrl),
        marriageDate: data.marriageDate ?? null,
        marriageLocation: normalizeNullableText(data.marriageLocation),
        officiantName: normalizeNullableText(data.officiantName),
        witnessOneName: normalizeNullableText(data.witnessOneName),
        witnessTwoName: normalizeNullableText(data.witnessTwoName),
        issuer: data.issuer || "Light Encounter Tabernacle Worldwide",
        certificateNumber: data.certificateNumber ?? null,
        expiresAt: data.expiresAt ?? null
      }
    });
    if (pendingApproval) return ok({ pendingApproval }, { status: 202 });

    const issuedAt = new Date();
    if (isEducation && academicCandidate) {
      const signedCertificate = await createAcademicCertificate({
        actorId: actor.id,
        candidate: academicCandidate,
        title: normalizedTitle,
        issuer: data.issuer,
        recipientName: normalizeNullableText(data.recipientName),
        recipientEmail: normalizeNullableText(data.recipientEmail),
        recipientPhone: normalizeNullableText(data.recipientPhone),
        recipientPhotoUrl: normalizeNullableText(data.recipientPhotoUrl),
        recipientOrganization: normalizeNullableText(data.recipientOrganization),
        educationLevel: normalizeNullableText(data.educationLevel) ?? normalizedTitle,
        programName: normalizeNullableText(data.programName) ?? normalizedTitle,
        fieldOfStudy: normalizeNullableText(data.fieldOfStudy) ?? "Theology",
        gradeOrHonors: normalizeNullableText(data.gradeOrHonors),
        studyMode: normalizeNullableText(data.studyMode),
        studyStartDate: nullableDate(data.studyStartDate),
        studyEndDate: nullableDate(data.studyEndDate),
        completionDate: nullableDate(data.completionDate),
        customBody: normalizeNullableText(data.customBody),
        certificatePreset,
        templateStyle: data.templateStyle ?? presetDefaults.templateStyle,
        templateAccent: data.templateAccent ?? presetDefaults.templateAccent,
        sealStyle: data.sealStyle ?? presetDefaults.sealStyle,
        signatureLayout: data.signatureLayout ?? presetDefaults.signatureLayout,
        watermarkStrength: data.watermarkStrength ?? presetDefaults.watermarkStrength,
        secondSignatoryName: normalizeNullableText(data.secondSignatoryName) ?? signatureProfile?.name ?? null,
        secondSignatoryTitle: normalizeNullableText(data.secondSignatoryTitle) ?? signatureProfile?.title ?? presetDefaults.secondSignatoryTitle,
        secondSignatorySignatureUrl: normalizeNullableText(data.secondSignatorySignatureUrl) ?? signatureProfile?.imageUrl ?? null,
        certificateNumber: data.certificateNumber ?? null,
        expiresAt: data.expiresAt ?? null
      });

      await logActivity({
        userId: actor.id,
        action: activityActions.certificationBadgeCreated,
        targetId: signedCertificate.id,
        metadata: {
          academicCandidateId: academicCandidate.id,
          recipientName: signedCertificate.recipientName,
          title: signedCertificate.title,
          certificateCategory: signedCertificate.certificateCategory,
          certificateNumber: signedCertificate.certificateNumber,
          sealNumber: signedCertificate.sealNumber
        }
      });

      return ok({ certificate: signedCertificate }, { status: 201 });
    }

    const certificate = await prisma.memberCertificationBadge.create({
      data: {
        userId: recipient?.id ?? null,
        academicCandidateId: null,
        title: normalizedTitle,
        issuer: data.issuer || "Light Encounter Tabernacle Worldwide",
        certificateCategory: data.certificateCategory,
        recipientName: normalizeNullableText(data.recipientName) ?? marriageHolderName ?? recipient?.name ?? null,
        recipientEmail: normalizeNullableText(data.recipientEmail) ?? recipient?.email ?? null,
        recipientPhone: normalizeNullableText(data.recipientPhone),
        recipientPhotoUrl: normalizeNullableText(data.recipientPhotoUrl),
        recipientOrganization: normalizeNullableText(data.recipientOrganization),
        educationLevel: normalizeNullableText(data.educationLevel) ?? (isEducation ? normalizedTitle : null),
        programName: normalizeNullableText(data.programName) ?? (isEducation ? normalizedTitle : null),
        fieldOfStudy: normalizeNullableText(data.fieldOfStudy) ?? (isEducation ? "Theology" : null),
        gradeOrHonors: normalizeNullableText(data.gradeOrHonors),
        studyMode: normalizeNullableText(data.studyMode),
        studyStartDate: nullableDate(data.studyStartDate),
        studyEndDate: nullableDate(data.studyEndDate),
        completionDate: nullableDate(data.completionDate),
        customBody: normalizeNullableText(data.customBody),
        certificatePreset,
        templateStyle: data.templateStyle ?? presetDefaults.templateStyle,
        templateAccent: data.templateAccent ?? presetDefaults.templateAccent,
        sealStyle: data.sealStyle ?? presetDefaults.sealStyle,
        signatureLayout: data.signatureLayout ?? presetDefaults.signatureLayout,
        watermarkStrength: data.watermarkStrength ?? presetDefaults.watermarkStrength,
        presidentSignatureUrl: isEducation ? null : normalizeNullableText(data.presidentSignatureUrl),
        secondSignatoryName: normalizeNullableText(data.secondSignatoryName),
        secondSignatoryTitle: normalizeNullableText(data.secondSignatoryTitle) ?? presetDefaults.secondSignatoryTitle,
        secondSignatorySignatureUrl: normalizeNullableText(data.secondSignatorySignatureUrl),
        spouseOneName: normalizeNullableText(data.spouseOneName),
        spouseOneEmail: normalizeNullableText(data.spouseOneEmail),
        spouseOnePhotoUrl: normalizeNullableText(data.spouseOnePhotoUrl),
        spouseTwoName: normalizeNullableText(data.spouseTwoName),
        spouseTwoEmail: normalizeNullableText(data.spouseTwoEmail),
        spouseTwoPhotoUrl: normalizeNullableText(data.spouseTwoPhotoUrl),
        marriageDate: nullableDate(data.marriageDate),
        marriageLocation: normalizeNullableText(data.marriageLocation),
        officiantName: normalizeNullableText(data.officiantName),
        witnessOneName: normalizeNullableText(data.witnessOneName),
        witnessTwoName: normalizeNullableText(data.witnessTwoName),
        certificateNumber: data.certificateNumber || generateCertificateNumber(data.certificateCategory),
        sealNumber: generateSealNumber(data.certificateCategory),
        verifyToken: randomUUID(),
        issuedAt,
        expiresAt: normalizeCertificateExpiry(data.expiresAt),
        createdById: actor.id
      }
    });
    const signedCertificate = await signStoredCertificate(certificate);
    await recordCertificateEvent({
      certificateId: signedCertificate.id,
      actorId: actor.id,
      eventType: "ISSUED",
      summary: `${signedCertificate.title} issued.`,
      metadata: {
        certificateNumber: signedCertificate.certificateNumber,
        sealNumber: signedCertificate.sealNumber,
        category: signedCertificate.certificateCategory,
        preset: signedCertificate.certificatePreset
      }
    });

    await logActivity({
      userId: actor.id,
      action: activityActions.certificationBadgeCreated,
      targetId: signedCertificate.id,
      metadata: {
        recipientId: recipient?.id ?? null,
        recipientName: signedCertificate.recipientName,
        title: signedCertificate.title,
        certificateCategory: signedCertificate.certificateCategory,
        certificateNumber: signedCertificate.certificateNumber,
        sealNumber: signedCertificate.sealNumber
      }
    });

    return ok({ certificate: signedCertificate }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
