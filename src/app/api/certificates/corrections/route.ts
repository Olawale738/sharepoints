import { z } from "zod";

import {
  CERTIFICATE_CORRECTION_TYPES,
  createCertificateCorrectionRequest,
  normalizeCertificateCorrectionChanges
} from "@/lib/certificate-corrections";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { getOfficialIssuanceAuthority } from "@/lib/official-issuance";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export const runtime = "nodejs";

const imageRefSchema = z
  .string()
  .trim()
  .max(600)
  .refine((value) => value.startsWith("/api/certificates/assets/") || value.startsWith("https://") || value.startsWith("http://"), {
    message: "Upload the corrected image or provide a valid image URL."
  });

const correctionSchema = z.object({
  certificateId: z.string().cuid(),
  correctionType: z.enum(CERTIFICATE_CORRECTION_TYPES),
  requestedChanges: z.object({
    recipientName: z.string().trim().max(180).optional().nullable(),
    completionDate: z.string().datetime().optional().nullable(),
    recipientPhotoUrl: imageRefSchema.optional().nullable(),
    educationLevel: z.string().trim().max(120).optional().nullable(),
    programName: z.string().trim().max(180).optional().nullable(),
    fieldOfStudy: z.string().trim().max(120).optional().nullable(),
    gradeOrHonors: z.string().trim().max(120).optional().nullable(),
    secondSignatoryName: z.string().trim().max(160).optional().nullable(),
    secondSignatoryTitle: z.string().trim().max(120).optional().nullable(),
    secondSignatorySignatureUrl: imageRefSchema.optional().nullable(),
    signatureNote: z.string().trim().max(500).optional().nullable()
  }),
  reason: z.string().trim().max(1200).optional().nullable()
});

function lower(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

async function canManageCorrections(userId: string) {
  const [isAdmin, authority] = await Promise.all([
    hasAnyWorkspaceAdminRole(userId),
    getOfficialIssuanceAuthority(userId)
  ]);
  return isAdmin || authority.canIssueCertificates || authority.canIssueAcademicCertificates;
}

async function studentScope(userId: string, email?: string | null) {
  const normalizedEmail = lower(email);
  const candidates = await prisma.academicCandidate.findMany({
    where: {
      OR: [
        { userId },
        ...(normalizedEmail ? [{ email: normalizedEmail }] : [])
      ]
    },
    select: { id: true }
  });
  const candidateIds = candidates.map((candidate) => candidate.id);
  const certificates = await prisma.memberCertificationBadge.findMany({
    where: {
      OR: [
        { userId },
        ...(normalizedEmail ? [{ recipientEmail: normalizedEmail }] : []),
        ...(candidateIds.length ? [{ academicCandidateId: { in: candidateIds } }] : [])
      ]
    },
    select: { id: true }
  });

  return {
    candidateIds,
    certificateIds: certificates.map((certificate) => certificate.id),
    normalizedEmail
  };
}

export async function GET() {
  try {
    const actor = await requireUser();
    const canManage = await canManageCorrections(actor.id);
    const scope = canManage ? null : await studentScope(actor.id, actor.email);
    const requests = await prisma.certificateCorrectionRequest.findMany({
      where: canManage
        ? undefined
        : {
            OR: [
              { requesterId: actor.id },
              ...(scope?.normalizedEmail ? [{ requesterEmail: scope.normalizedEmail }] : []),
              ...(scope?.certificateIds.length ? [{ certificateId: { in: scope.certificateIds } }] : []),
              ...(scope?.candidateIds.length ? [{ academicCandidateId: { in: scope.candidateIds } }] : [])
            ]
          },
      orderBy: { createdAt: "desc" },
      take: canManage ? 500 : 100
    });
    const certificateIds = Array.from(new Set(requests.map((request) => request.certificateId)));
    const candidateIds = Array.from(new Set(requests.map((request) => request.academicCandidateId).filter(Boolean))) as string[];
    const [certificates, candidates] = await Promise.all([
      certificateIds.length
        ? prisma.memberCertificationBadge.findMany({
            where: { id: { in: certificateIds } },
            select: { id: true, title: true, certificateNumber: true, status: true, recipientName: true, recipientEmail: true, academicCandidateId: true }
          })
        : [],
      candidateIds.length
        ? prisma.academicCandidate.findMany({
            where: { id: { in: candidateIds } },
            select: { id: true, fullName: true, email: true, educationLevel: true, programName: true, clearanceStatus: true }
          })
        : []
    ]);
    const certificatesById = new Map(certificates.map((certificate) => [certificate.id, certificate]));
    const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));

    return ok({
      requests: requests.map((request) => ({
        ...request,
        certificate: certificatesById.get(request.certificateId) ?? null,
        candidate: request.academicCandidateId ? candidatesById.get(request.academicCandidateId) ?? null : null
      })),
      canManage
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    const parsed = correctionSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid correction request.");

    const certificate = await prisma.memberCertificationBadge.findUnique({ where: { id: parsed.data.certificateId } });
    if (!certificate) throw new ApiError(404, "Certificate not found.");
    if (certificate.status === "REPLACED") throw new ApiError(409, "This certificate has already been replaced. Request correction on the newest certificate.");

    const candidate = certificate.academicCandidateId
      ? await prisma.academicCandidate.findUnique({ where: { id: certificate.academicCandidateId } })
      : null;
    const normalizedEmail = lower(actor.email);
    const canManage = await canManageCorrections(actor.id);
    const ownsCertificate =
      certificate.userId === actor.id ||
      (normalizedEmail && lower(certificate.recipientEmail) === normalizedEmail) ||
      candidate?.userId === actor.id ||
      (normalizedEmail && lower(candidate?.email) === normalizedEmail);

    if (!canManage && !ownsCertificate) {
      throw new ApiError(403, "You can request correction only for certificates connected to your student record.");
    }

    const correctionRequest = await createCertificateCorrectionRequest({
      certificateId: certificate.id,
      academicCandidateId: certificate.academicCandidateId,
      requesterId: actor.id,
      requesterName: actor.name ?? null,
      requesterEmail: actor.email ?? certificate.recipientEmail ?? candidate?.email ?? null,
      correctionType: parsed.data.correctionType,
      requestedChanges: normalizeCertificateCorrectionChanges(parsed.data.requestedChanges),
      reason: parsed.data.reason
    });

    return ok({ correctionRequest }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
