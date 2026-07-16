import "server-only";

import { randomBytes } from "node:crypto";
import type { AcademicCandidate, MemberCertificationBadge, Prisma } from "@prisma/client";

import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const DEGREE_CERTIFICATE_TITLES = [
  "Bachelor of Science in Theology",
  "Master of Science in Theology",
  "Doctor of Philosophy in Theology"
] as const;

export const LICENSE_TYPES = [
  "MINISTRY_LICENSE",
  "PREACHING_PERMIT",
  "ORDINATION_CARD",
  "WORKER_PERMIT",
  "ACCESS_CREDENTIAL"
] as const;

export function isDegreeCertificate(title?: string | null, educationLevel?: string | null) {
  const value = `${title ?? ""} ${educationLevel ?? ""}`.toLowerCase();
  return (
    value.includes("bachelor") ||
    value.includes("bsc") ||
    value.includes("b.sc") ||
    value.includes("master") ||
    value.includes("msc") ||
    value.includes("m.sc") ||
    value.includes("doctor") ||
    value.includes("phd") ||
    value.includes("ph.d")
  );
}

export function generateMinistryLicenseNumber(type: string) {
  const prefix = type === "PREACHING_PERMIT"
    ? "LETW-PREACH"
    : type === "ORDINATION_CARD"
      ? "LETW-ORD"
      : type === "WORKER_PERMIT"
        ? "LETW-WORK"
        : type === "ACCESS_CREDENTIAL"
          ? "LETW-ACCESS"
          : "LETW-LIC";
  return `${prefix}-${new Date().getUTCFullYear()}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function hasApprovedAcademicBoard(candidateId: string) {
  const approval = await prisma.academicBoardApprovalCandidate.findFirst({
    where: {
      candidateId,
      status: "APPROVED"
    }
  });
  if (!approval) return false;
  const board = await prisma.academicBoardApproval.findFirst({
    where: { id: approval.boardId, status: "APPROVED" },
    select: { id: true }
  });
  return Boolean(board);
}

export async function requireAcademicBoardApproval(candidate: AcademicCandidate, title?: string | null) {
  if (!isDegreeCertificate(title, candidate.educationLevel)) return;

  const approved = await hasApprovedAcademicBoard(candidate.id);
  if (!approved) {
    throw new ApiError(
      409,
      "Academic board approval is required before issuing BSc, MSc, PhD, or other degree theology certificates. Add this candidate to an approved graduation list first."
    );
  }
}

function lower(value?: string | null) {
  return value?.trim().toLowerCase() || "";
}

function normalizedDate(value?: Date | string | null) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

type AuditFindingInput = {
  severity: string;
  findingType: string;
  title: string;
  detail: string;
  candidateId?: string | null;
  certificateId?: string | null;
};

function addFinding(findings: AuditFindingInput[], input: AuditFindingInput) {
  findings.push(input);
}

export async function runAcademicAudit(actorId: string) {
  const [candidates, certificates, boardRows] = await Promise.all([
    prisma.academicCandidate.findMany({ orderBy: { createdAt: "desc" }, take: 2000 }),
    prisma.memberCertificationBadge.findMany({
      where: { certificateCategory: "EDUCATION" },
      orderBy: { issuedAt: "desc" },
      take: 2000
    }),
    prisma.academicBoardApprovalCandidate.findMany({
      where: { status: "APPROVED" },
      take: 2000
    })
  ]);
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const approvedCandidateIds = new Set<string>();
  if (boardRows.length) {
    const boards = await prisma.academicBoardApproval.findMany({
      where: { id: { in: Array.from(new Set(boardRows.map((row) => row.boardId))) }, status: "APPROVED" },
      select: { id: true }
    });
    const approvedBoardIds = new Set(boards.map((board) => board.id));
    boardRows.forEach((row) => {
      if (approvedBoardIds.has(row.boardId)) approvedCandidateIds.add(row.candidateId);
    });
  }

  const findings: AuditFindingInput[] = [];
  const byEmail = new Map<string, AcademicCandidate[]>();
  const byNameProgram = new Map<string, AcademicCandidate[]>();

  candidates.forEach((candidate) => {
    if (!candidate.photoUrl) {
      addFinding(findings, {
        severity: "HIGH",
        findingType: "MISSING_PHOTO",
        title: "Candidate photo missing",
        detail: `${candidate.fullName} has no photo uploaded. Academic certificates should not be issued without a verified portrait.`,
        candidateId: candidate.id
      });
    }
    if (!candidate.nameVerified) {
      addFinding(findings, {
        severity: "MEDIUM",
        findingType: "NAME_NOT_VERIFIED",
        title: "Candidate name not verified",
        detail: `${candidate.fullName} has not passed name verification.`,
        candidateId: candidate.id
      });
    }
    if (!candidate.coursesCompleted) {
      addFinding(findings, {
        severity: "HIGH",
        findingType: "INCOMPLETE_COURSES",
        title: "Courses incomplete",
        detail: `${candidate.fullName} is not marked as courses completed.`,
        candidateId: candidate.id
      });
    }
    const admission = normalizedDate(candidate.admissionDate);
    const graduation = normalizedDate(candidate.graduationDate);
    if (admission && graduation && admission > graduation) {
      addFinding(findings, {
        severity: "HIGH",
        findingType: "DATE_CONFLICT",
        title: "Admission date is after graduation date",
        detail: `${candidate.fullName} has admission date later than graduation date.`,
        candidateId: candidate.id
      });
    }
    if (candidate.email) {
      const key = lower(candidate.email);
      byEmail.set(key, [...(byEmail.get(key) ?? []), candidate]);
    }
    const nameProgramKey = `${lower(candidate.fullName)}::${lower(candidate.programName)}::${lower(candidate.educationLevel)}`;
    byNameProgram.set(nameProgramKey, [...(byNameProgram.get(nameProgramKey) ?? []), candidate]);
  });

  for (const [email, rows] of byEmail.entries()) {
    if (rows.length > 1) {
      addFinding(findings, {
        severity: "MEDIUM",
        findingType: "DUPLICATE_EMAIL",
        title: "Duplicate academic candidate email",
        detail: `${email} appears on ${rows.length} candidate records: ${rows.map((row) => row.fullName).join(", ")}.`,
        candidateId: rows[0]?.id
      });
    }
  }
  for (const rows of byNameProgram.values()) {
    if (rows.length > 1) {
      addFinding(findings, {
        severity: "MEDIUM",
        findingType: "DUPLICATE_CANDIDATE",
        title: "Possible duplicate candidate record",
        detail: `${rows[0]?.fullName ?? "Candidate"} appears ${rows.length} times for the same program and level.`,
        candidateId: rows[0]?.id
      });
    }
  }

  certificates.forEach((certificate) => {
    const candidate = certificate.academicCandidateId ? candidateById.get(certificate.academicCandidateId) : null;
    if (!candidate) {
      addFinding(findings, {
        severity: "HIGH",
        findingType: "MISSING_CANDIDATE_LINK",
        title: "Certificate not linked to candidate registry",
        detail: `${certificate.certificateNumber ?? certificate.title} is not connected to a valid academic candidate record.`,
        certificateId: certificate.id
      });
      return;
    }
    if (lower(certificate.recipientName) && lower(certificate.recipientName) !== lower(candidate.fullName)) {
      addFinding(findings, {
        severity: "HIGH",
        findingType: "NAME_MISMATCH",
        title: "Certificate name differs from candidate registry",
        detail: `${certificate.certificateNumber ?? certificate.title} says "${certificate.recipientName}" but candidate registry says "${candidate.fullName}".`,
        candidateId: candidate.id,
        certificateId: certificate.id
      });
    }
    if (!certificate.recipientPhotoUrl) {
      addFinding(findings, {
        severity: "MEDIUM",
        findingType: "CERTIFICATE_PHOTO_MISSING",
        title: "Certificate has no holder photo",
        detail: `${certificate.certificateNumber ?? certificate.title} has no holder photo stored.`,
        candidateId: candidate.id,
        certificateId: certificate.id
      });
    }
    if (isDegreeCertificate(certificate.title, certificate.educationLevel) && !approvedCandidateIds.has(candidate.id)) {
      addFinding(findings, {
        severity: "CRITICAL",
        findingType: "BOARD_APPROVAL_MISSING",
        title: "Degree certificate lacks board approval",
        detail: `${certificate.certificateNumber ?? certificate.title} is a degree credential but the candidate is not on an approved academic board list.`,
        candidateId: candidate.id,
        certificateId: certificate.id
      });
    }
  });

  const counts = findings.reduce<Record<string, number>>((acc, finding) => {
    acc[finding.severity] = (acc[finding.severity] ?? 0) + 1;
    return acc;
  }, {});
  const run = await prisma.academicAuditRun.create({
    data: {
      title: `Academic audit - ${new Date().toISOString().slice(0, 10)}`,
      status: "COMPLETED",
      summary: `${findings.length} academic record issue(s) found.`,
      counts: counts as Prisma.InputJsonValue,
      createdById: actorId
    }
  });
  if (findings.length) {
    await prisma.academicAuditFinding.createMany({
      data: findings.map((finding) => ({
        runId: run.id,
        ...finding
      }))
    });
  }

  return prisma.academicAuditRun.findUnique({
    where: { id: run.id }
  });
}
