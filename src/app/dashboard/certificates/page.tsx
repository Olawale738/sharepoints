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
  const canManage = authority.canIssueCertificates;
  const [users, certificateRows] = await Promise.all([
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
      where: isAdmin ? undefined : { userId: session.user.id },
      orderBy: { issuedAt: "desc" },
      take: isAdmin ? 500 : 100
    })
  ]);
  const certificateUsers = await prisma.user.findMany({
    where: {
      id: {
        in: Array.from(new Set(certificateRows.map((certificate) => certificate.userId)))
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
    user: usersById.get(certificate.userId) ?? {
      id: certificate.userId,
      name: null,
      email: null,
      image: null,
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
              Auto-generate and verify certificates for baptism, membership, training, ordination, conferences, volunteer service, and
              course completion.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-mint">{activeCount} active</Badge>
            <Badge>{certificates.length} total</Badge>
          </div>
        </div>
      </section>

      <CertificateGeneratorPanel canManage={canManage} certificates={certificates} users={users} />
    </div>
  );
}
