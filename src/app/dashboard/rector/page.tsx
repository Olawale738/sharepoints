import { redirect } from "next/navigation";
import { GraduationCap, ShieldCheck } from "lucide-react";

import { auth } from "@/auth";
import { CertificateGeneratorPanel } from "@/components/dashboard/certificate-generator-panel";
import { Badge } from "@/components/ui/badge";
import { certificateIsLive } from "@/lib/certificates";
import { getOfficialIssuanceAuthority } from "@/lib/official-issuance";
import { prisma } from "@/lib/prisma";

export default async function RectorDashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const authority = await getOfficialIssuanceAuthority(session.user.id);
  if (!authority.canIssueAcademicCertificates) {
    redirect("/dashboard/certificates");
  }

  const [users, certificateRows] = await Promise.all([
    prisma.user.findMany({
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
    }),
    prisma.memberCertificationBadge.findMany({
      where: { certificateCategory: "EDUCATION" },
      orderBy: { issuedAt: "desc" },
      take: 500
    })
  ]);

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
    user: certificate.userId
      ? usersById.get(certificate.userId) ?? {
          id: certificate.userId,
          name: null,
          email: null,
          image: null,
          memberProfile: null
        }
      : {
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
      <section className="overflow-hidden rounded-lg border border-ink/10 bg-white shadow-soft">
        <div className="border-b border-[#d4af37]/40 bg-[#0b1b3d] px-5 py-6 text-white">
          <p className="flex items-center gap-2 text-sm font-medium text-[#f6d878]">
            <GraduationCap className="h-4 w-4" />
            Rector academic dashboard
          </p>
          <h1 className="mt-2 text-3xl font-semibold">LETW theology certificates</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/75">
            Issue Certificate in Theology, Diploma, Advanced Diploma, BSc, MSc, and PhD credentials with candidate photo,
            rector signature, academic seal chip, QR verification, and cryptographic hash protection.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 p-5">
          <Badge className="bg-mint text-moss">
            <ShieldCheck className="h-3.5 w-3.5" />
            president assigned rector
          </Badge>
          <Badge>{activeCount} active academic credentials</Badge>
          <Badge>{certificates.length} total academic records</Badge>
          {authority.isPresident ? <Badge className="bg-[#fff6d8] text-[#7c5d00]">president serving as rector</Badge> : null}
        </div>
      </section>

      <CertificateGeneratorPanel academicOnly canManage certificates={certificates} users={users} />
    </div>
  );
}
