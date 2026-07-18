import Link from "next/link";
import { redirect } from "next/navigation";
import { GraduationCap } from "lucide-react";

import { auth } from "@/auth";
import { StudentPortalPanel } from "@/components/dashboard/student-portal-panel";
import { Badge } from "@/components/ui/badge";
import { getOfficialIssuanceAuthority } from "@/lib/official-issuance";
import { prisma } from "@/lib/prisma";

function lower(value?: string | null) {
  return value?.trim().toLowerCase() || null;
}

export default async function StudentPortalPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const normalizedEmail = lower(session.user.email);
  const candidates = await prisma.academicCandidate.findMany({
    where: {
      OR: [
        { userId: session.user.id },
        ...(normalizedEmail ? [{ email: normalizedEmail }] : [])
      ]
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 20
  });
  const candidateIds = candidates.map((candidate) => candidate.id);
  const [courses, certificates] = await Promise.all([
    candidateIds.length
      ? prisma.academicCourseRecord.findMany({
          where: { candidateId: { in: candidateIds } },
          orderBy: [{ completedAt: "desc" }, { createdAt: "desc" }],
          take: 200
        })
      : [],
    prisma.memberCertificationBadge.findMany({
      where: {
        OR: [
          { userId: session.user.id },
          ...(normalizedEmail ? [{ recipientEmail: normalizedEmail }] : []),
          ...(candidateIds.length ? [{ academicCandidateId: { in: candidateIds } }] : [])
        ],
        certificateCategory: "EDUCATION"
      },
      orderBy: { issuedAt: "desc" },
      take: 100
    })
  ]);
  const certificateIds = certificates.map((certificate) => certificate.id);
  const [correctionRequests, authority] = await Promise.all([
    prisma.certificateCorrectionRequest.findMany({
    where: {
      OR: [
        { requesterId: session.user.id },
        ...(normalizedEmail ? [{ requesterEmail: normalizedEmail }] : []),
        ...(certificateIds.length ? [{ certificateId: { in: certificateIds } }] : []),
        ...(candidateIds.length ? [{ academicCandidateId: { in: candidateIds } }] : [])
      ]
    },
    orderBy: { createdAt: "desc" },
    take: 100
    }),
    getOfficialIssuanceAuthority(session.user.id)
  ]);

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <GraduationCap className="h-4 w-4" />
              Student ID Portal
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Student ID, academic status, certificates, and corrections</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
              View your Student ID number, expiry date, admission record, clearance checklist, completed courses, issued certificates, and correction requests without exposing the academic registry to other users.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge>{candidates.length} student record(s)</Badge>
            <Badge>{certificates.length} certificate(s)</Badge>
            <Badge>{correctionRequests.filter((request) => request.status === "PENDING").length} pending correction(s)</Badge>
            {authority.canManageSchoolAcademics ? (
              <Link className="inline-flex h-8 items-center rounded-md border border-ink/10 bg-paper px-3 text-xs font-medium text-ink hover:bg-mint/40" href="/dashboard/school-secretary">
                Register admission
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <StudentPortalPanel
        candidates={candidates}
        certificates={certificates}
        correctionRequests={correctionRequests.map((request) => ({
          ...request,
          requestedChanges: request.requestedChanges && typeof request.requestedChanges === "object" && !Array.isArray(request.requestedChanges)
            ? request.requestedChanges as Record<string, unknown>
            : {}
        }))}
        courses={courses}
      />
    </div>
  );
}
