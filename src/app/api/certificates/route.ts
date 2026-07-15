import { randomUUID } from "crypto";
import { PresidentialApprovalTargetType } from "@prisma/client";
import { z } from "zod";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { certificateCredentialHash, generateCertificateNumber, generateSealNumber, signCertificate, THEOLOGY_CERTIFICATE_TYPES } from "@/lib/certificate-security";
import { normalizeCertificateExpiry } from "@/lib/certificates";
import { getOfficialIssuanceAuthority, requireCertificateIssuer } from "@/lib/official-issuance";
import { maybeQueuePresidentialApproval } from "@/lib/president-controls";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

const certificateSchema = z.object({
  userId: z.string().cuid().optional().nullable(),
  title: z.string().trim().min(3).max(160),
  certificateCategory: z.enum(["MINISTRY", "EDUCATION"]).default("MINISTRY"),
  recipientName: z.string().trim().max(180).optional().nullable(),
  recipientEmail: z.string().trim().email().optional().nullable(),
  recipientPhone: z.string().trim().max(60).optional().nullable(),
  recipientPhotoUrl: z.string().trim().url().optional().nullable(),
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
    const canSeeRegistry = isAdmin || authority.canIssueCertificates;
    const certificateRows = await prisma.memberCertificationBadge.findMany({
      where: canSeeRegistry ? undefined : { userId: user.id },
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
      canManage: authority.canIssueCertificates
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    await requireCertificateIssuer(actor.id);
    const parsed = certificateSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid certificate.");
    }

    const data = parsed.data;
    const normalizedTitle = normalizeNullableText(data.title) ?? "Membership Certificate";
    const isEducation = data.certificateCategory === "EDUCATION";
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
    if (!recipient && !normalizeNullableText(data.recipientName)) {
      throw new ApiError(422, "Enter the external candidate name or select a LETW member.");
    }
    if (isEducation && !THEOLOGY_CERTIFICATE_TYPES.includes(normalizedTitle as (typeof THEOLOGY_CERTIFICATE_TYPES)[number]) && !normalizeNullableText(data.programName)) {
      throw new ApiError(422, "Educational certificates need a theology program name or one of the theology certificate levels.");
    }

    const pendingApproval = await maybeQueuePresidentialApproval({
      requesterId: actor.id,
      targetType: PresidentialApprovalTargetType.CERTIFICATE,
      targetId: recipient?.id ?? null,
      title: `Certificate approval: ${normalizedTitle}`,
      summary: `Approve issuing ${normalizedTitle} to ${recipient?.name ?? data.recipientName ?? data.recipientEmail ?? "external candidate"}.`,
      payload: {
        userId: recipient?.id ?? null,
        title: normalizedTitle,
        certificateCategory: data.certificateCategory,
        recipientName: normalizeNullableText(data.recipientName) ?? recipient?.name ?? null,
        recipientEmail: normalizeNullableText(data.recipientEmail) ?? recipient?.email ?? null,
        recipientPhone: normalizeNullableText(data.recipientPhone),
        recipientPhotoUrl: normalizeNullableText(data.recipientPhotoUrl),
        recipientOrganization: normalizeNullableText(data.recipientOrganization),
        educationLevel: normalizeNullableText(data.educationLevel) ?? (isEducation ? normalizedTitle : null),
        programName: normalizeNullableText(data.programName) ?? (isEducation ? normalizedTitle : null),
        fieldOfStudy: normalizeNullableText(data.fieldOfStudy) ?? (isEducation ? "Theology" : null),
        gradeOrHonors: normalizeNullableText(data.gradeOrHonors),
        studyMode: normalizeNullableText(data.studyMode),
        studyStartDate: data.studyStartDate ?? null,
        studyEndDate: data.studyEndDate ?? null,
        completionDate: data.completionDate ?? null,
        customBody: normalizeNullableText(data.customBody),
        issuer: data.issuer || "Light Encounter Tabernacle Worldwide",
        certificateNumber: data.certificateNumber ?? null,
        expiresAt: data.expiresAt ?? null
      }
    });
    if (pendingApproval) return ok({ pendingApproval }, { status: 202 });

    const issuedAt = new Date();
    const certificate = await prisma.memberCertificationBadge.create({
      data: {
        userId: recipient?.id ?? null,
        title: normalizedTitle,
        issuer: data.issuer || "Light Encounter Tabernacle Worldwide",
        certificateCategory: data.certificateCategory,
        recipientName: normalizeNullableText(data.recipientName) ?? recipient?.name ?? null,
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
        certificateNumber: data.certificateNumber || generateCertificateNumber(data.certificateCategory),
        sealNumber: generateSealNumber(data.certificateCategory),
        verifyToken: randomUUID(),
        issuedAt,
        expiresAt: normalizeCertificateExpiry(data.expiresAt),
        createdById: actor.id
      }
    });
    const digitalSignature = signCertificate(certificate);
    const credentialHash = certificateCredentialHash(certificate);
    const signedCertificate = await prisma.memberCertificationBadge.update({
      where: { id: certificate.id },
      data: { digitalSignature, credentialHash }
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
