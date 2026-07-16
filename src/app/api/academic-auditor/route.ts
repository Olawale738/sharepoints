import { z } from "zod";

import { ApiError, ok, requireUser } from "@/lib/api";
import { runAcademicAudit } from "@/lib/academic-operations";
import { handleAcademicOpsRouteError } from "@/lib/academic-ops-db";
import { requireAcademicCertificateIssuer } from "@/lib/official-issuance";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    const actor = await requireUser();
    await requireAcademicCertificateIssuer(actor.id);
    const runs = await prisma.academicAuditRun.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
    const latestRun = runs[0] ?? null;
    const findings = latestRun
      ? await prisma.academicAuditFinding.findMany({ where: { runId: latestRun.id }, orderBy: [{ severity: "asc" }, { createdAt: "desc" }], take: 500 })
      : [];
    return ok({ runs, findings });
  } catch (error) {
    return handleAcademicOpsRouteError(error);
  }
}

export async function POST() {
  try {
    const actor = await requireUser();
    await requireAcademicCertificateIssuer(actor.id);
    const run = await runAcademicAudit(actor.id);
    return ok({ run }, { status: 201 });
  } catch (error) {
    return handleAcademicOpsRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requireUser();
    await requireAcademicCertificateIssuer(actor.id);
    const parsed = z.object({ id: z.string().cuid(), status: z.enum(["OPEN", "RESOLVED"]) }).safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, "Invalid audit finding update.");
    const finding = await prisma.academicAuditFinding.update({
      where: { id: parsed.data.id },
      data: {
        status: parsed.data.status,
        resolvedAt: parsed.data.status === "RESOLVED" ? new Date() : null,
        resolvedById: parsed.data.status === "RESOLVED" ? actor.id : null
      }
    });
    return ok({ finding });
  } catch (error) {
    return handleAcademicOpsRouteError(error);
  }
}
