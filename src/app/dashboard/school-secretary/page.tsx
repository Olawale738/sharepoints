import { redirect } from "next/navigation";
import { ClipboardCheck, GraduationCap } from "lucide-react";

import { auth } from "@/auth";
import { AcademicOperationsPanel } from "@/components/dashboard/academic-operations-panel";
import { Badge } from "@/components/ui/badge";
import { ACADEMIC_OPS_SETUP_MESSAGE, isAcademicOpsSchemaNotReady } from "@/lib/academic-ops-db";
import { getOfficialIssuanceAuthority } from "@/lib/official-issuance";
import { prisma } from "@/lib/prisma";

export default async function SchoolSecretaryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const authority = await getOfficialIssuanceAuthority(session.user.id);
  if (!authority.canManageSchoolAcademics) redirect("/dashboard");

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

  const [candidates, boards, boardCandidates] = await Promise.all([
    prisma.academicCandidate.findMany({ orderBy: [{ updatedAt: "desc" }], take: 1000 }),
    academicOpsQuery(prisma.academicBoardApproval.findMany({ orderBy: { createdAt: "desc" }, take: 100 }), []),
    academicOpsQuery(prisma.academicBoardApprovalCandidate.findMany({ orderBy: { createdAt: "desc" }, take: 1000 }), [])
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <ClipboardCheck className="h-4 w-4" />
              School Secretary Dashboard
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Theology school admissions and Student IDs</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
              Register admitted theology students, issue admission-based Student IDs, update student ID expiry, maintain academic records, and prepare graduation lists for rector approval.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-mint text-moss"><GraduationCap className="h-3.5 w-3.5" />Theology school only</Badge>
            <Badge>{candidates.length} student record(s)</Badge>
            <Badge>{boards.length} graduation list(s)</Badge>
          </div>
        </div>
      </section>

      <AcademicOperationsPanel
        auditFindings={[]}
        auditRuns={[]}
        boardCandidates={boardCandidates}
        boards={boards}
        canAcademic={false}
        canManageSchoolAcademics
        canMinistryLicense={false}
        candidates={candidates}
        certificates={[]}
        corrections={[]}
        ministries={[]}
        ministryLicenses={[]}
        printLogs={[]}
        setupWarning={setupWarning}
        units={[]}
        users={[]}
        workspaces={[]}
      />
    </div>
  );
}
