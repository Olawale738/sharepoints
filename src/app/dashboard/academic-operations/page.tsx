import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";

import { auth } from "@/auth";
import { AcademicOperationsPanel } from "@/components/dashboard/academic-operations-panel";
import { Badge } from "@/components/ui/badge";
import { ACADEMIC_OPS_SETUP_MESSAGE, isAcademicOpsSchemaNotReady } from "@/lib/academic-ops-db";
import { getOfficialIssuanceAuthority } from "@/lib/official-issuance";
import { prisma } from "@/lib/prisma";

export default async function AcademicOperationsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const authority = await getOfficialIssuanceAuthority(session.user.id);
  if (!authority.canIssueAcademicCertificates && !authority.canIssueCertificates) {
    redirect("/dashboard");
  }

  let setupWarning: string | null = null;
  async function academicOpsQuery<T>(query: Promise<T>, fallback: T) {
    try {
      return await query;
    } catch (error) {
      if (isAcademicOpsSchemaNotReady(error)) {
        setupWarning = ACADEMIC_OPS_SETUP_MESSAGE;
        return fallback;
      }
      throw error;
    }
  }

  const [
    candidates,
    certificates,
    corrections,
    users,
    ministries,
    workspaces,
    units
  ] = await Promise.all([
    prisma.academicCandidate.findMany({ orderBy: [{ updatedAt: "desc" }], take: 1000 }),
    prisma.memberCertificationBadge.findMany({
      where: authority.canIssueCertificates ? undefined : { certificateCategory: "EDUCATION" },
      orderBy: { issuedAt: "desc" },
      take: 1000,
      select: {
        id: true,
        title: true,
        certificateNumber: true,
        certificateCategory: true,
        recipientName: true,
        recipientEmail: true,
        academicCandidateId: true,
        status: true
      }
    }),
    prisma.certificateCorrectionRequest.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
    authority.canIssueCertificates
      ? prisma.user.findMany({
          where: { deletedAt: null, accessRevokedAt: null },
          select: { id: true, name: true, email: true },
          orderBy: [{ name: "asc" }, { email: "asc" }],
          take: 1000
        })
      : [],
    authority.canIssueCertificates ? prisma.ministry.findMany({ where: { active: true }, orderBy: { name: "asc" }, take: 500 }) : [],
    authority.canIssueCertificates ? prisma.workspace.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }) : [],
    authority.canIssueCertificates ? prisma.organizationUnit.findMany({ where: { active: true }, select: { id: true, name: true, type: true }, orderBy: [{ type: "asc" }, { name: "asc" }], take: 500 }) : []
  ]);

  const [boards, boardCandidates, printLogs, ministryLicenses, auditRuns] = await Promise.all([
    academicOpsQuery(prisma.academicBoardApproval.findMany({ orderBy: { createdAt: "desc" }, take: 100 }), []),
    academicOpsQuery(prisma.academicBoardApprovalCandidate.findMany({ orderBy: { createdAt: "desc" }, take: 1000 }), []),
    academicOpsQuery(prisma.certificatePrintLog.findMany({ orderBy: { createdAt: "desc" }, take: 500 }), []),
    authority.canIssueCertificates
      ? academicOpsQuery(prisma.ministryLicense.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 500 }), [])
      : [],
    academicOpsQuery(prisma.academicAuditRun.findMany({ orderBy: { createdAt: "desc" }, take: 20 }), [])
  ]);
  const latestAuditRun = auditRuns[0] ?? null;
  const auditFindings = latestAuditRun
    ? await academicOpsQuery(prisma.academicAuditFinding.findMany({ where: { runId: latestAuditRun.id }, orderBy: [{ severity: "asc" }, { createdAt: "desc" }], take: 500 }), [])
    : [];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <GraduationCap className="h-4 w-4" />
              Academic Operations Center
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Board approvals, corrections, print control, licenses, and audit</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
              A rector and president-facing command center for academic governance and ministry credential control.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>{boards.filter((board) => board.status === "APPROVED").length} approved lists</Badge>
            <Badge>{corrections.filter((request) => request.status === "PENDING").length} pending corrections</Badge>
            <Badge>{printLogs.length} print logs</Badge>
          </div>
        </div>
      </section>

      <AcademicOperationsPanel
        auditFindings={auditFindings}
        auditRuns={auditRuns}
        boardCandidates={boardCandidates}
        boards={boards}
        canAcademic={authority.canIssueAcademicCertificates}
        canMinistryLicense={authority.canIssueCertificates}
        candidates={candidates}
        certificates={certificates}
        corrections={corrections.map((request) => ({
          ...request,
          requestedChanges: request.requestedChanges && typeof request.requestedChanges === "object" && !Array.isArray(request.requestedChanges)
            ? request.requestedChanges as Record<string, unknown>
            : {}
        }))}
        ministries={ministries}
        ministryLicenses={ministryLicenses}
        printLogs={printLogs}
        setupWarning={setupWarning}
        units={units}
        users={users}
        workspaces={workspaces}
      />
    </div>
  );
}
