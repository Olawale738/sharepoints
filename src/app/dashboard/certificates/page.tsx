import { redirect } from "next/navigation";
import { Award } from "lucide-react";

import { auth } from "@/auth";
import { CertificateGeneratorPanel } from "@/components/dashboard/certificate-generator-panel";
import { Badge } from "@/components/ui/badge";
import { certificateIsLive } from "@/lib/certificates";
import { getOfficialIssuanceAuthority } from "@/lib/official-issuance";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export default async function CertificatesPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const [isAdmin, authority] = await Promise.all([
    hasAnyWorkspaceAdminRole(session.user.id),
    getOfficialIssuanceAuthority(session.user.id)
  ]);
  const canManage = authority.canIssueCertificates || authority.canIssueAcademicCertificates;
  const academicOnly = authority.canIssueAcademicCertificates && !authority.canIssueCertificates && !isAdmin;
  const [users, certificateRows, academicCandidates, signatureProfiles, batchJobs, correctionRequests] = await Promise.all([
    canManage
      ? prisma.user.findMany({
          where: {
            deletedAt: null,
            accessRevokedAt: null,
            email: { endsWith: "@letw.org" }
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
          },
          orderBy: [{ name: "asc" }, { email: "asc" }],
          take: 1000
        })
      : [],
    prisma.memberCertificationBadge.findMany({
      where: isAdmin ? undefined : canManage ? (academicOnly ? { certificateCategory: "EDUCATION" } : undefined) : { userId: session.user.id },
      orderBy: { issuedAt: "desc" },
      take: isAdmin ? 500 : 100
    }),
    canManage
      ? prisma.academicCandidate.findMany({
          orderBy: [{ updatedAt: "desc" }],
          take: 1000
        })
      : [],
    canManage
      ? prisma.certificateSignatureProfile.findMany({
          where: { active: true },
          orderBy: [{ role: "asc" }, { name: "asc" }],
          take: 500
        })
      : [],
    canManage
      ? prisma.certificateBatchJob.findMany({
          where: { certificateCategory: "EDUCATION" },
          orderBy: { createdAt: "desc" },
          take: 30
        })
      : [],
    canManage
      ? prisma.certificateCorrectionRequest.findMany({
          orderBy: { createdAt: "desc" },
          take: 200
        })
      : []
  ]);
  const [candidateCourses, candidateCertificates] = canManage
    ? await Promise.all([
        prisma.academicCourseRecord.findMany({
          where: { candidateId: { in: academicCandidates.map((candidate) => candidate.id) } },
          orderBy: { createdAt: "desc" },
          take: 2000
        }),
        prisma.memberCertificationBadge.findMany({
          where: { academicCandidateId: { in: academicCandidates.map((candidate) => candidate.id) } },
          select: { id: true, academicCandidateId: true, title: true, certificateNumber: true, status: true, issuedAt: true },
          orderBy: { issuedAt: "desc" },
          take: 1000
        })
      ])
    : [[], []];
  const correctionCertificateIds = Array.from(new Set(correctionRequests.map((request) => request.certificateId)));
  const correctionCandidateIds = Array.from(new Set(correctionRequests.map((request) => request.academicCandidateId).filter(Boolean))) as string[];
  const [correctionCertificates, correctionCandidates] = canManage
    ? await Promise.all([
        correctionCertificateIds.length
          ? prisma.memberCertificationBadge.findMany({
              where: { id: { in: correctionCertificateIds } },
              select: { id: true, title: true, certificateNumber: true, status: true, recipientName: true, recipientEmail: true }
            })
          : [],
        correctionCandidateIds.length
          ? prisma.academicCandidate.findMany({
              where: { id: { in: correctionCandidateIds } },
              select: { id: true, fullName: true, email: true, educationLevel: true, programName: true }
            })
          : []
      ])
    : [[], []];
  const correctionCertificatesById = new Map(correctionCertificates.map((certificate) => [certificate.id, certificate]));
  const correctionCandidatesById = new Map(correctionCandidates.map((candidate) => [candidate.id, candidate]));
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
  const usersById = new Map(certificateUsers.map((user) => [user.id, user]));
  const certificates = certificateRows.map((certificate) => ({
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
  }));

  const activeCount = certificates.filter((certificate) => certificateIsLive(certificate)).length;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <Award className="h-4 w-4" />
              Certificate Generator
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Official LETW certificates</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
              Auto-generate and verify certificates for baptism, membership, training, ordination, conferences, volunteer service,
              course completion, and theology education credentials.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-mint">{activeCount} active</Badge>
            <Badge>{certificates.length} total</Badge>
          </div>
        </div>
      </section>

      <CertificateGeneratorPanel
        academicCandidates={academicCandidates.map((candidate) => ({
          ...candidate,
          courses: candidateCourses.filter((course) => course.candidateId === candidate.id),
          certificates: candidateCertificates.filter((certificate) => certificate.academicCandidateId === candidate.id)
        }))}
        academicOnly={academicOnly}
        batchJobs={batchJobs}
        canManage={canManage}
        certificates={certificates}
        correctionRequests={correctionRequests.map((request) => ({
          ...request,
          requestedChanges: request.requestedChanges && typeof request.requestedChanges === "object" && !Array.isArray(request.requestedChanges)
            ? request.requestedChanges as Record<string, unknown>
            : {},
          certificate: correctionCertificatesById.get(request.certificateId) ?? null,
          candidate: request.academicCandidateId ? correctionCandidatesById.get(request.academicCandidateId) ?? null : null
        }))}
        signatureProfiles={signatureProfiles}
        users={users}
      />
    </div>
  );
}
