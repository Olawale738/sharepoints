import Link from "next/link";
import { redirect } from "next/navigation";
import { ContactRound } from "lucide-react";

import { auth } from "@/auth";
import { MemberCrmPanel } from "@/components/dashboard/member-crm-panel";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";
import { userAccessStatus } from "@/lib/user-access";

function serializeProfile(profile: Awaited<ReturnType<typeof getMembers>>[number]["memberProfile"]) {
  return {
    phone: profile?.phone ?? null,
    alternatePhone: profile?.alternatePhone ?? null,
    membershipNumber: profile?.membershipNumber ?? null,
    membershipStatus: profile?.membershipStatus ?? "ACTIVE",
    dateOfBirth: profile?.dateOfBirth?.toISOString() ?? null,
    gender: profile?.gender ?? null,
    maritalStatus: profile?.maritalStatus ?? null,
    address: profile?.address ?? null,
    city: profile?.city ?? null,
    country: profile?.country ?? null,
    occupation: profile?.occupation ?? null,
    employer: profile?.employer ?? null,
    emergencyContactName: profile?.emergencyContactName ?? null,
    emergencyContactPhone: profile?.emergencyContactPhone ?? null,
    firstVisitAt: profile?.firstVisitAt?.toISOString() ?? null,
    salvationAt: profile?.salvationAt?.toISOString() ?? null,
    baptismAt: profile?.baptismAt?.toISOString() ?? null,
    membershipStartedAt: profile?.membershipStartedAt?.toISOString() ?? null,
    weddingAnniversaryAt: profile?.weddingAnniversaryAt?.toISOString() ?? null,
    organizationPosition: profile?.organizationPosition ?? null,
    digitalIdLocation: profile?.digitalIdLocation ?? "LETTW Worldwide",
    communicationPreference: profile?.communicationPreference ?? null,
    ministryInterests: Array.isArray(profile?.ministryInterests) ? (profile.ministryInterests as string[]) : [],
    skills: Array.isArray(profile?.skills) ? (profile.skills as string[]) : [],
    pastoralCareStatus: profile?.pastoralCareStatus ?? null,
    adminNotes: profile?.adminNotes ?? null
  };
}

function getMembers() {
  return prisma.user.findMany({
    include: {
      memberProfile: true,
      department: { select: { name: true } },
      workspaceMemberships: {
        include: { workspace: { select: { id: true, name: true } } },
        orderBy: { joinedAt: "asc" }
      },
      _count: {
        select: {
          uploadedFiles: true,
          taskAssignments: true,
          activityLogs: true
        }
      }
    },
    orderBy: [{ deletedAt: "asc" }, { name: "asc" }],
    take: 500
  });
}

export default async function MemberCrmPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await hasAnyWorkspaceAdminRole(session.user.id))) redirect("/dashboard");
  const members = await getMembers();

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss"><ContactRound className="h-4 w-4" />LETW Member CRM</p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Member 360 profiles</h1>
            <p className="mt-2 max-w-3xl text-sm text-ink/60">
              A private administrator view of member identity, contact details, ministry involvement, care status, milestones, and workspace roles.
            </p>
          </div>
          <Link className="inline-flex h-10 items-center justify-center rounded-md border border-ink/10 bg-paper px-4 text-sm font-medium" href="/dashboard/admin">
            Back to admin
          </Link>
        </div>
      </section>
      <MemberCrmPanel
        members={members.map((member) => ({
          id: member.id,
          name: member.name,
          email: member.email,
          image: member.image,
          category: member.category,
          createdAt: member.createdAt.toISOString(),
          status: userAccessStatus(member),
          department: member.department,
          workspaceMemberships: member.workspaceMemberships.map((membership) => ({
            role: membership.role,
            workspace: membership.workspace
          })),
          profile: serializeProfile(member.memberProfile),
          stats: {
            files: member._count.uploadedFiles,
            tasks: member._count.taskAssignments,
            activities: member._count.activityLogs
          }
        }))}
      />
    </div>
  );
}
