import { z } from "zod";
import { randomBytes } from "node:crypto";

import { academicClearanceStatus } from "@/lib/academic-certificates";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { requireAcademicCertificateIssuer } from "@/lib/official-issuance";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const candidateSchema = z.object({
  userId: z.string().cuid().optional().nullable(),
  fullName: z.string().trim().min(2).max(180),
  email: z.string().trim().email().optional().nullable(),
  phone: z.string().trim().max(60).optional().nullable(),
  photoUrl: z.string().trim().max(600).optional().nullable(),
  organization: z.string().trim().max(180).optional().nullable(),
  programName: z.string().trim().min(2).max(180),
  educationLevel: z.string().trim().min(2).max(120),
  fieldOfStudy: z.string().trim().max(120).optional().nullable(),
  studyMode: z.string().trim().max(80).optional().nullable(),
  admissionDate: z.string().datetime().optional().nullable(),
  graduationDate: z.string().datetime().optional().nullable(),
  studentIdExpiresAt: z.string().datetime().optional().nullable(),
  paymentStatus: z.string().trim().max(40).optional().nullable(),
  feesCleared: z.boolean().optional(),
  coursesCompleted: z.boolean().optional(),
  rectorApproved: z.boolean().optional(),
  photoUploaded: z.boolean().optional(),
  nameVerified: z.boolean().optional(),
  clearanceNotes: z.string().trim().max(1600).optional().nullable()
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

export async function GET() {
  try {
    const actor = await requireUser();
    await requireAcademicCertificateIssuer(actor.id);
    const [candidates, batchJobs] = await Promise.all([
      prisma.academicCandidate.findMany({
        orderBy: [{ updatedAt: "desc" }],
        take: 1000
      }),
      prisma.certificateBatchJob.findMany({ where: { certificateCategory: "EDUCATION" }, orderBy: { createdAt: "desc" }, take: 30 })
    ]);

    const certificates = await prisma.memberCertificationBadge.findMany({
      where: {
        academicCandidateId: {
          in: candidates.map((candidate) => candidate.id)
        }
      },
      select: { id: true, academicCandidateId: true, title: true, certificateNumber: true, status: true, issuedAt: true },
      orderBy: { issuedAt: "desc" },
      take: 1000
    });
    const courses = await prisma.academicCourseRecord.findMany({
      where: { candidateId: { in: candidates.map((candidate) => candidate.id) } },
      orderBy: [{ candidateId: "asc" }, { createdAt: "desc" }],
      take: 2000
    });

    return ok({
      candidates: candidates.map((candidate) => ({
        ...candidate,
        certificates: certificates.filter((certificate) => certificate.academicCandidateId === candidate.id),
        courses: courses.filter((course) => course.candidateId === candidate.id)
      })),
      batchJobs
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    await requireAcademicCertificateIssuer(actor.id);
    const parsed = candidateSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid academic candidate.");
    const data = parsed.data;
    const flags = {
      feesCleared: data.feesCleared ?? false,
      coursesCompleted: data.coursesCompleted ?? false,
      rectorApproved: data.rectorApproved ?? false,
      photoUploaded: data.photoUploaded ?? Boolean(data.photoUrl),
      nameVerified: data.nameVerified ?? false
    };
    const admittedAt = nullableDate(data.admissionDate) ?? new Date();
    const candidate = await prisma.academicCandidate.create({
      data: {
        userId: data.userId ?? null,
        fullName: data.fullName,
        email: nullableText(data.email)?.toLowerCase() ?? null,
        phone: nullableText(data.phone),
        photoUrl: nullableText(data.photoUrl),
        organization: nullableText(data.organization),
        programName: data.programName,
        educationLevel: data.educationLevel,
        fieldOfStudy: nullableText(data.fieldOfStudy) ?? "Theology",
        studyMode: nullableText(data.studyMode),
        admissionDate: admittedAt,
        graduationDate: nullableDate(data.graduationDate),
        studentIdNumber: generateStudentIdNumber(admittedAt),
        studentIdIssuedAt: admittedAt,
        studentIdExpiresAt: nullableDate(data.studentIdExpiresAt),
        studentIdStatus: "ACTIVE",
        paymentStatus: nullableText(data.paymentStatus) ?? (flags.feesCleared ? "CLEARED" : "PENDING"),
        ...flags,
        clearanceStatus: academicClearanceStatus(flags),
        clearanceNotes: nullableText(data.clearanceNotes),
        reviewedById: flags.rectorApproved || flags.feesCleared || flags.coursesCompleted || flags.nameVerified ? actor.id : null,
        reviewedAt: flags.rectorApproved || flags.feesCleared || flags.coursesCompleted || flags.nameVerified ? new Date() : null,
        createdById: actor.id
      }
    });

    return ok({ candidate }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
