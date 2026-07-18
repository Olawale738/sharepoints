import { z } from "zod";
import { randomBytes } from "node:crypto";

import { academicClearanceStatus } from "@/lib/academic-certificates";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { requireSchoolAcademicManager } from "@/lib/official-issuance";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const updateSchema = z.object({
  fullName: z.string().trim().min(2).max(180).optional(),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(60).optional().nullable(),
  photoUrl: z.string().trim().max(600).optional().nullable(),
  organization: z.string().trim().max(180).optional().nullable(),
  programName: z.string().trim().min(2).max(180).optional(),
  educationLevel: z.string().trim().min(2).max(120).optional(),
  fieldOfStudy: z.string().trim().max(120).optional().nullable(),
  studyMode: z.string().trim().max(80).optional().nullable(),
  admissionDate: z.string().datetime().optional().nullable(),
  graduationDate: z.string().datetime().optional().nullable(),
  studentIdExpiresAt: z.string().datetime().optional().nullable(),
  studentIdStatus: z.string().trim().max(40).optional(),
  paymentStatus: z.string().trim().max(40).optional().nullable(),
  feesCleared: z.boolean().optional(),
  coursesCompleted: z.boolean().optional(),
  rectorApproved: z.boolean().optional(),
  photoUploaded: z.boolean().optional(),
  nameVerified: z.boolean().optional(),
  clearanceNotes: z.string().trim().max(1600).optional().nullable(),
  status: z.string().trim().max(40).optional(),
  course: z.object({
    courseCode: z.string().trim().max(40).optional().nullable(),
    courseTitle: z.string().trim().min(2).max(180),
    credits: z.coerce.number().min(0).max(60).optional().nullable(),
    grade: z.string().trim().max(40).optional().nullable(),
    status: z.string().trim().max(40).optional().nullable(),
    completedAt: z.string().datetime().optional().nullable()
  }).optional()
});

function nullableDate(value?: string | null) {
  return value ? new Date(value) : null;
}

function nullableText(value?: string | null) {
  const text = value?.trim();
  return text || null;
}

function generateStudentIdNumber(date = new Date()) {
  return `LETW-STU-${date.getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const actor = await requireUser();
    await requireSchoolAcademicManager(actor.id);
    const { id } = await context.params;
    const existing = await prisma.academicCandidate.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Academic candidate not found.");
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid academic candidate update.");
    const data = parsed.data;

    if (data.course) {
      const course = await prisma.academicCourseRecord.create({
        data: {
          candidateId: id,
          courseCode: nullableText(data.course.courseCode),
          courseTitle: data.course.courseTitle,
          credits: data.course.credits ?? null,
          grade: nullableText(data.course.grade),
          status: nullableText(data.course.status) ?? "COMPLETED",
          completedAt: nullableDate(data.course.completedAt),
          createdById: actor.id
        }
      });
      return ok({ course });
    }

    const flags = {
      feesCleared: data.feesCleared ?? existing.feesCleared,
      coursesCompleted: data.coursesCompleted ?? existing.coursesCompleted,
      rectorApproved: data.rectorApproved ?? existing.rectorApproved,
      photoUploaded: data.photoUploaded ?? existing.photoUploaded,
      nameVerified: data.nameVerified ?? existing.nameVerified
    };
    const admissionDate = data.admissionDate === undefined ? existing.admissionDate : nullableDate(data.admissionDate) ?? new Date();
    const shouldIssueStudentId = !existing.studentIdNumber && Boolean(admissionDate);
    const studentIdIssuedAt = admissionDate ?? existing.createdAt ?? new Date();
    const candidate = await prisma.academicCandidate.update({
      where: { id },
      data: {
        fullName: data.fullName,
        email: data.email === undefined ? undefined : nullableText(data.email)?.toLowerCase() ?? null,
        phone: data.phone === undefined ? undefined : nullableText(data.phone),
        photoUrl: data.photoUrl === undefined ? undefined : nullableText(data.photoUrl),
        organization: data.organization === undefined ? undefined : nullableText(data.organization),
        programName: data.programName,
        educationLevel: data.educationLevel,
        fieldOfStudy: data.fieldOfStudy === undefined ? undefined : nullableText(data.fieldOfStudy) ?? "Theology",
        studyMode: data.studyMode === undefined ? undefined : nullableText(data.studyMode),
        admissionDate: data.admissionDate === undefined ? undefined : admissionDate,
        graduationDate: data.graduationDate === undefined ? undefined : nullableDate(data.graduationDate),
        studentIdNumber: shouldIssueStudentId ? generateStudentIdNumber(studentIdIssuedAt) : undefined,
        studentIdIssuedAt: shouldIssueStudentId || (!existing.studentIdIssuedAt && data.studentIdExpiresAt !== undefined) ? studentIdIssuedAt : undefined,
        studentIdExpiresAt: data.studentIdExpiresAt === undefined ? undefined : nullableDate(data.studentIdExpiresAt),
        studentIdStatus: data.studentIdStatus,
        paymentStatus: data.paymentStatus === undefined ? undefined : nullableText(data.paymentStatus) ?? "PENDING",
        status: data.status,
        ...flags,
        clearanceStatus: academicClearanceStatus(flags),
        clearanceNotes: data.clearanceNotes === undefined ? undefined : nullableText(data.clearanceNotes),
        reviewedById: actor.id,
        reviewedAt: new Date()
      }
    });

    return ok({ candidate });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const actor = await requireUser();
    await requireSchoolAcademicManager(actor.id);
    const { id } = await context.params;
    const existing = await prisma.academicCandidate.findUnique({
      where: { id },
      select: { id: true }
    });
    if (!existing) throw new ApiError(404, "Registered graduand not found.");

    const certificateCount = await prisma.memberCertificationBadge.count({ where: { academicCandidateId: id } });
    if (certificateCount > 0) {
      throw new ApiError(409, "This candidate has certificate history. Mark the candidate inactive instead of deleting.");
    }

    await prisma.$transaction([
      prisma.academicBoardApprovalCandidate.deleteMany({ where: { candidateId: id } }),
      prisma.certificateCorrectionRequest.deleteMany({ where: { academicCandidateId: id } }),
      prisma.academicCourseRecord.deleteMany({ where: { candidateId: id } }),
      prisma.academicCandidate.delete({ where: { id } })
    ]);

    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
