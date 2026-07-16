import { z } from "zod";

import { createAcademicCertificate, requireClearedAcademicCandidate } from "@/lib/academic-certificates";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { CERTIFICATE_PRESET_VALUES, certificatePresetDefaults, inferCertificatePreset } from "@/lib/certificate-presets";
import { requireAcademicCertificateIssuer } from "@/lib/official-issuance";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const batchSchema = z.object({
  title: z.string().trim().min(3).max(160),
  candidateIds: z.array(z.string().cuid()).optional(),
  csv: z.string().trim().max(30000).optional().nullable(),
  certificatePreset: z.enum(CERTIFICATE_PRESET_VALUES).optional().nullable(),
  signatureProfileId: z.string().cuid().optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable()
});

function splitCsvLine(line: string) {
  const result: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (char === "," && !quoted) {
      result.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  result.push(current.trim());
  return result;
}

function csvCandidateSelectors(csv?: string | null) {
  if (!csv) return [];
  return csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.toLowerCase().startsWith("name,"))
    .map((line) => {
      const [nameOrId, email, programName, educationLevel, completionDate] = splitCsvLine(line);
      return { nameOrId, email, programName, educationLevel, completionDate };
    });
}

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    await requireAcademicCertificateIssuer(actor.id);
    const parsed = batchSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid certificate batch.");
    const data = parsed.data;
    const preset = inferCertificatePreset({
      certificatePreset: data.certificatePreset,
      certificateCategory: "EDUCATION",
      title: data.title
    });
    const defaults = certificatePresetDefaults(preset);
    const signatureProfile = data.signatureProfileId
      ? await prisma.certificateSignatureProfile.findFirst({ where: { id: data.signatureProfileId, active: true } })
      : null;
    if (data.signatureProfileId && !signatureProfile) throw new ApiError(404, "Selected signature profile was not found.");

    const csvSelectors = csvCandidateSelectors(data.csv);
    const candidateIds = Array.from(new Set([...(data.candidateIds ?? []), ...csvSelectors.map((row) => row.nameOrId).filter((value) => value.startsWith("cm"))]));
    const emailSelectors = csvSelectors.map((row) => row.email?.toLowerCase()).filter(Boolean) as string[];
    const nameSelectors = csvSelectors.map((row) => row.nameOrId).filter((value) => value && !value.startsWith("cm"));
    const candidates = await prisma.academicCandidate.findMany({
      where: {
        OR: [
          candidateIds.length ? { id: { in: candidateIds } } : {},
          emailSelectors.length ? { email: { in: emailSelectors } } : {},
          nameSelectors.length ? { fullName: { in: nameSelectors } } : {}
        ].filter((value) => Object.keys(value).length > 0)
      },
      take: 1000
    });
    if (!candidates.length) throw new ApiError(422, "No academic candidates matched the batch request.");

    const results: Array<{ candidateId: string; name: string; status: string; certificateId?: string; error?: string }> = [];
    for (const candidate of candidates) {
      try {
        await requireClearedAcademicCandidate(candidate.id);
        const csvRow = csvSelectors.find((row) => row.nameOrId === candidate.id || row.email?.toLowerCase() === candidate.email?.toLowerCase() || row.nameOrId === candidate.fullName);
        const certificate = await createAcademicCertificate({
          actorId: actor.id,
          candidate,
          title: data.title,
          certificatePreset: preset,
          templateStyle: defaults.templateStyle,
          templateAccent: defaults.templateAccent,
          sealStyle: defaults.sealStyle,
          signatureLayout: defaults.signatureLayout,
          watermarkStrength: defaults.watermarkStrength,
          programName: csvRow?.programName || candidate.programName,
          educationLevel: csvRow?.educationLevel || candidate.educationLevel,
          completionDate: csvRow?.completionDate ? new Date(csvRow.completionDate) : candidate.graduationDate,
          secondSignatoryName: signatureProfile?.name ?? null,
          secondSignatoryTitle: signatureProfile?.title ?? defaults.secondSignatoryTitle,
          secondSignatorySignatureUrl: signatureProfile?.imageUrl ?? null,
          expiresAt: data.expiresAt ?? null
        });
        results.push({ candidateId: candidate.id, name: candidate.fullName, status: "ISSUED", certificateId: certificate.id });
      } catch (error) {
        results.push({
          candidateId: candidate.id,
          name: candidate.fullName,
          status: "FAILED",
          error: error instanceof Error ? error.message : "Candidate could not be issued."
        });
      }
    }

    const issuedCount = results.filter((result) => result.status === "ISSUED").length;
    const failedCount = results.length - issuedCount;
    const batch = await prisma.certificateBatchJob.create({
      data: {
        title: data.title,
        certificateCategory: "EDUCATION",
        status: failedCount ? (issuedCount ? "PARTIAL" : "FAILED") : "COMPLETED",
        totalRows: results.length,
        issuedCount,
        failedCount,
        createdById: actor.id,
        metadata: { results }
      }
    });

    return ok({ batch, results });
  } catch (error) {
    return handleRouteError(error);
  }
}
