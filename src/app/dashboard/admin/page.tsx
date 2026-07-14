import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  Award,
  BellRing,
  BookOpen,
  Building2,
  CalendarClock,
  ClipboardCheck,
  ContactRound,
  Crown,
  Database,
  FileClock,
  FileSignature,
  FileLock2,
  Files,
  Gauge,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
  UsersRound,
  UserRoundSearch,
  Workflow,
  ShieldAlert,
  Globe2,
  IdCard,
  KeyRound,
  LockKeyhole,
  MessageCircle
} from "lucide-react";

import { auth } from "@/auth";
import { AdminOrganizationPanel } from "@/components/dashboard/admin-organization-panel";
import { AdminUsersPanel } from "@/components/dashboard/admin-users-panel";
import { ApprovalQueue } from "@/components/dashboard/approval-queue";
import { ClearAiAuditButton } from "@/components/dashboard/clear-ai-audit-button";
import { CompanyInvitationsPanel } from "@/components/dashboard/company-invitations-panel";
import { ClearOrganizationActivityButton } from "@/components/dashboard/clear-organization-activity-button";
import { SecurityCenterPanel } from "@/components/dashboard/security-center-panel";
import { SuperAdminRecoveryPanel } from "@/components/dashboard/super-admin-recovery-panel";
import { Badge } from "@/components/ui/badge";
import { normalizeEmail } from "@/lib/email-policy";
import { getAdminVisibleWorkspaceIds } from "@/lib/governance";
import { prisma } from "@/lib/prisma";
import { getProtectedAdminStatuses, isProtectedAdminEmail, superAdminRecoveryConfigured } from "@/lib/protected-admin";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";
import { userAccessStatus } from "@/lib/user-access";
import { formatBytes, formatDate } from "@/lib/utils";

export default async function AdminControlCenterPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (!(await hasAnyWorkspaceAdminRole(session.user.id))) {
    redirect("/dashboard");
  }

  const workspaceIds = await getAdminVisibleWorkspaceIds(session.user.id);
  const now = new Date();
  const [
    users,
    invitations,
    departments,
    approvals,
    securityEvents,
    workspaces,
    fileStats,
    meetings,
    activities,
    aiAudits,
    protectedAdminStatuses,
    rolePermissionCount,
    activeShareLinkCount
  ] = await Promise.all([
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        departmentId: true,
        category: true,
        forcePasswordReset: true,
        singleActiveSession: true,
        suspendedAt: true,
        accessRevokedAt: true,
        deletedAt: true,
        workspaceMemberships: {
          select: {
            role: true
          }
        },
        _count: {
          select: {
            workspaceMemberships: true,
            uploadedFiles: true,
            activityLogs: true
          }
        }
      },
      orderBy: [{ deletedAt: "asc" }, { createdAt: "desc" }],
      take: 500
    }),
    prisma.companyEmailInvitation.findMany({
      include: {
        invitedBy: {
          select: {
            name: true,
            email: true
          }
        },
        acceptedBy: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 250
    }),
    prisma.department.findMany({
      include: {
        _count: {
          select: {
            members: true,
            workspaceAccess: true
          }
        }
      },
      orderBy: [{ kind: "asc" }, { name: "asc" }]
    }),
    prisma.approvalRequest.findMany({
      where: {
        workspaceId: {
          in: workspaceIds
        }
      },
      include: {
        workspace: {
          select: {
            id: true,
            name: true
          }
        },
        requester: {
          select: {
            name: true,
            email: true
          }
        },
        reviewer: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: 100
    }),
    prisma.securityEvent.findMany({
      include: {
        user: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 150
    }),
    prisma.workspace.findMany({
      where: { deletedAt: null },
      include: {
        _count: {
          select: {
            files: true,
            members: true,
            chatChannels: true,
            meetings: true,
            tasks: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 100
    }),
    prisma.file.aggregate({
      where: { deletedAt: null },
      _sum: {
        size: true
      },
      _count: {
        id: true
      }
    }),
    prisma.workspaceMeeting.findMany({
      include: {
        workspace: {
          select: {
            id: true,
            name: true
          }
        },
        createdBy: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: [{ startsAt: "desc" }],
      take: 12
    }),
    prisma.activityLog.findMany({
      include: {
        workspace: {
          select: {
            id: true,
            name: true
          }
        },
        user: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 30
    }),
    prisma.aiAssistantAudit.findMany({
      include: {
        user: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 30
    }),
    getProtectedAdminStatuses(),
    prisma.workspaceRolePermission.count(),
    prisma.fileShareLink.count({
      where: {
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }]
      }
    })
  ]);

  const protectedAdminInvitationEmails = new Set([
    (process.env.SEED_ADMIN_EMAIL ?? "president@letw.org").toLowerCase(),
    ...users
      .filter((user) => user.workspaceMemberships.some((membership) => membership.role === "ADMIN"))
      .map((user) => normalizeEmail(user.email))
      .filter((email): email is string => Boolean(email))
  ]);
  const activeUsers = users.filter((user) => userAccessStatus(user) === "ACTIVE").length;
  const pendingApprovals = approvals.filter((approval) => approval.status === "PENDING").length;
  const pendingInvitations = invitations.filter((invitation) => !invitation.acceptedAt && !invitation.revokedAt).length;
  const storageBytes = fileStats._sum.size ?? 0;
  const metricCards = [
    {
      label: "Users",
      value: users.length,
      detail: `${activeUsers} active`,
      icon: UsersRound
    },
    {
      label: "Workspaces",
      value: workspaces.length,
      detail: `${rolePermissionCount} custom permission rules`,
      icon: ShieldCheck
    },
    {
      label: "Documents",
      value: fileStats._count.id,
      detail: formatBytes(storageBytes),
      icon: Files
    },
    {
      label: "Pending approvals",
      value: pendingApprovals,
      detail: `${pendingInvitations} pending invitations`,
      icon: Workflow
    },
    {
      label: "Storage links",
      value: activeShareLinkCount,
      detail: "Active member-only download links",
      icon: Database
    },
    {
      label: "Security events",
      value: securityEvents.length,
      detail: "Recent login and access events",
      icon: Activity
    },
    {
      label: "AI audits",
      value: aiAudits.length,
      detail: "Recent permission-aware searches",
      icon: Sparkles
    }
  ];
  const adminNavigationGroups = [
    {
      title: "Core Administration",
      description: "Organization structure and enterprise-wide controls.",
      links: [
        {
          href: "/dashboard/admin/global",
          label: "Global church network",
          detail: "Countries, regions, branches, churches, ministries, and leaders.",
          icon: Globe2
        },
        {
          href: "/dashboard/leadership",
          label: "Leadership suite",
          detail: "Role-based home, branch directory, service planning, receipts, follow-ups, reports, and command map.",
          icon: Crown
        },
        {
          href: "/dashboard/leadership-governance",
          label: "Leadership governance",
          detail: "Decision tracker, monthly report packs, confidential vault, leadership handovers, and official letters.",
          icon: FileClock
        },
        {
          href: "/dashboard/leadership-documents",
          label: "Private leadership documents",
          detail: "Top-level protected files outside normal workspaces with audited preview, download, and deletion.",
          icon: FileLock2
        },
        {
          href: "/dashboard/admin/branches",
          label: "Branch dashboards",
          detail: "Network intelligence, unit health, leaders, members, projects, and transfers.",
          icon: Building2
        },
        {
          href: "/dashboard/admin/branch-health",
          label: "Branch compliance",
          detail: "Score every country, branch, church, and ministry by members, attendance, compliance, care, and governance.",
          icon: Gauge
        },
        {
          href: "/dashboard/admin/president-desk",
          label: "President approval desk",
          detail: "Central approval queue for files, meetings, tasks, announcements, and executive matters.",
          icon: Crown
        },
        {
          href: "/dashboard/admin/president-wall",
          label: "President Approval Wall",
          detail: "President-only sensitive approvals and emergency lockdown for downloads, logins, documents, issuing, workspaces, and finance.",
          icon: LockKeyhole
        },
        {
          href: "/dashboard/admin/enterprise",
          label: "Enterprise controls",
          detail: "Security, governance, backup, DLP, AI agents, and platform controls.",
          icon: ShieldAlert
        }
      ]
    },
    {
      title: "People & Identity",
      description: "Members, profiles, digital IDs, QR access, and certificates.",
      links: [
        {
          href: "/dashboard/admin/members",
          label: "Member CRM",
          detail: "Profiles, photos, care details, CSV import, member numbers, positions, and roles.",
          icon: ContactRound
        },
        {
          href: "/dashboard/admin/qr-identity",
          label: "QR Identity",
          detail: "Digital ID cards, QR verification, access approvals, and scan logs.",
          icon: IdCard
        },
        {
          href: "/dashboard/admin/seal-registry",
          label: "Seal registry",
          detail: "Verify official letters, certificates, reports, handovers, IDs, receipts, and signatures.",
          icon: ShieldCheck
        },
        {
          href: "/dashboard/admin/official-issuance",
          label: "Official issuer permissions",
          detail: "President-only delegation for certificate, digital ID-card, and official letter issuing authority.",
          icon: FileSignature
        },
        {
          href: "/dashboard/certificates",
          label: "Certificates",
          detail: "Generate baptism, membership, training, ordination, and service certificates.",
          icon: Award
        }
      ]
    },
    {
      title: "Governance & Compliance",
      description: "Required forms, access reviews, and permission hygiene.",
      links: [
        {
          href: "/dashboard/compliance",
          label: "Required forms",
          detail: "Push forms to members, review submissions, and manage sanctions.",
          icon: ClipboardCheck
        },
        {
          href: "/dashboard/admin/access-review",
          label: "Access review",
          detail: "Review workspace roles, share links, AI agents, old devices, and sensitive access.",
          icon: ShieldAlert
        },
        {
          href: "/dashboard/admin/governance",
          label: "Presidential governance",
          detail: "Document policy, approval locks, watermarks, branch risk, redaction, credentials, incidents, circulars, and privacy consent.",
          icon: ShieldCheck
        },
        {
          href: "/dashboard/access-requests",
          label: "Access requests",
          detail: "Approve or reject member requests for private workspaces and restricted files.",
          icon: KeyRound
        },
        {
          href: "/dashboard/admin/authority-flow",
          label: "Authority flow",
          detail: "See how approvals move from requester to leader, admin, and president-level review.",
          icon: Workflow
        },
        {
          href: "/dashboard/admin/permission-simulator",
          label: "Permission simulator",
          detail: "Preview exactly what any member can see, use, download, or search.",
          icon: UserRoundSearch
        },
        {
          href: "/dashboard/admin/document-renewals",
          label: "Document renewals",
          detail: "Track expiry dates, send reminders, renew records, and archive old documents.",
          icon: FileClock
        },
        {
          href: "/dashboard/admin/notifications",
          label: "Notification center",
          detail: "Broadcast in-app, email, and configured WhatsApp messages to controlled audiences.",
          icon: BellRing
        },
        {
          href: "/dashboard/admin/whatsapp-inbox",
          label: "WhatsApp inbox",
          detail: "Receive member replies, match phone numbers to profiles, and answer from LETW.",
          icon: MessageCircle
        }
      ]
    },
    {
      title: "Publishing & Knowledge",
      description: "Internal knowledge and selected public content for letw.org.",
      links: [
        {
          href: "/dashboard/admin/public-site",
          label: "letw.org sync",
          detail: "Publish approved announcements, events, sermons, branches, and forms.",
          icon: Globe2
        },
        {
          href: "/dashboard/knowledge",
          label: "Knowledge",
          detail: "Doctrines, policies, procedures, branch manuals, forms, guides, and FAQs.",
          icon: BookOpen
        },
        {
          href: "/dashboard/mobile-app",
          label: "Mobile app",
          detail: "Installable PWA, offline shell, notifications, ID card, chat, and scanner access.",
          icon: Smartphone
        }
      ]
    }
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <SlidersHorizontal className="h-4 w-4" />
              LETW admin control center
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Organization command center</h1>
            <p className="mt-2 max-w-3xl text-sm text-ink/60">
              Manage users, invitations, workspaces, roles, approvals, activity, storage, meetings, departments, and security from one place.
            </p>
          </div>
          <Link
            className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-ink/10 bg-paper px-4 text-sm font-medium text-ink transition hover:bg-mint/50"
            href="/dashboard"
          >
            Back to dashboard
          </Link>
        </div>
      </section>

      <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
        <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-ink">Admin navigation</p>
            <p className="text-xs text-ink/55">Organized shortcuts for the most important LETW control areas.</p>
          </div>
          <Badge>{adminNavigationGroups.reduce((total, group) => total + group.links.length, 0)} tools</Badge>
        </div>
        <div className="grid gap-4 xl:grid-cols-4">
          {adminNavigationGroups.map((group) => (
            <div className="rounded-lg border border-ink/10 bg-paper p-3" key={group.title}>
              <h2 className="text-sm font-semibold text-ink">{group.title}</h2>
              <p className="mt-1 min-h-10 text-xs leading-5 text-ink/55">{group.description}</p>
              <div className="mt-3 space-y-2">
                {group.links.map((item) => {
                  const Icon = item.icon;

                  return (
                    <Link
                      className="block rounded-md border border-ink/10 bg-white p-3 transition hover:bg-mint/40"
                      href={item.href}
                      key={item.href}
                    >
                      <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                        <Icon className="h-4 w-4 text-moss" />
                        {item.label}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-ink/55">{item.detail}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {metricCards.map((metric) => {
          const Icon = metric.icon;

          return (
            <div key={metric.label} className="rounded-lg border border-ink/10 bg-white p-4">
              <Icon className="h-5 w-5 text-moss" />
              <p className="mt-3 text-2xl font-semibold text-ink">{metric.value}</p>
              <p className="text-sm text-ink/55">{metric.label}</p>
              <p className="mt-1 text-xs text-ink/45">{metric.detail}</p>
            </div>
          );
        })}
      </section>

      <ApprovalQueue
        approvals={approvals.map((approval) => ({
          id: approval.id,
          targetType: approval.targetType,
          targetId: approval.targetId,
          title: approval.title,
          status: approval.status,
          reason: approval.reason,
          createdAt: approval.createdAt.toISOString(),
          reviewedAt: approval.reviewedAt?.toISOString() ?? null,
          workspace: approval.workspace,
          requester: approval.requester,
          reviewer: approval.reviewer
        }))}
      />

      <AdminOrganizationPanel
        users={users.map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          departmentId: user.departmentId,
          category: user.category,
          forcePasswordReset: user.forcePasswordReset,
          singleActiveSession: user.singleActiveSession,
          isAdmin: user.workspaceMemberships.some((membership) => membership.role === "ADMIN")
        }))}
        departments={departments}
      />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <AdminUsersPanel
            currentUserId={session.user.id}
            users={users.map((user) => ({
              id: user.id,
              name: user.name,
              email: user.email,
              image: user.image,
              createdAt: user.createdAt.toISOString(),
              suspendedAt: user.suspendedAt?.toISOString() ?? null,
              accessRevokedAt: user.accessRevokedAt?.toISOString() ?? null,
              deletedAt: user.deletedAt?.toISOString() ?? null,
              isAdmin: user.workspaceMemberships.some((membership) => membership.role === "ADMIN"),
              protectedAdmin: isProtectedAdminEmail(user.email),
              status: userAccessStatus(user),
              _count: user._count
            }))}
          />

          <SecurityCenterPanel
            events={securityEvents.map((event) => ({
              id: event.id,
              type: event.type,
              email: event.email,
              ipAddress: event.ipAddress,
              userAgent: event.userAgent,
              createdAt: event.createdAt.toISOString(),
              user: event.user
            }))}
          />

          <section className="rounded-lg border border-ink/10 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-moss" />
                <h2 className="text-sm font-semibold">AI access audit</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>{aiAudits.length}</Badge>
                <ClearAiAuditButton disabled={aiAudits.length === 0} />
              </div>
            </div>
            <div className="divide-y divide-ink/10">
              {aiAudits.length === 0 ? (
                <p className="px-4 py-8 text-sm text-ink/55">No AI assistant requests yet.</p>
              ) : null}
              {aiAudits.map((audit) => {
                const sources = Array.isArray(audit.sources) ? audit.sources : [];

                return (
                  <div className="px-4 py-3" key={audit.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-medium text-ink">{audit.user.name ?? audit.user.email ?? "Member"}</p>
                      <Badge className={audit.status === "COMPLETED" ? "bg-mint" : "bg-paper"}>
                        {audit.status.toLowerCase().replaceAll("_", " ")}
                      </Badge>
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-ink/65">{audit.question}</p>
                    <p className="mt-1 text-xs text-ink/40">
                      {audit.mode.toLowerCase().replaceAll("_", " ")} - {sources.length} authorized sources -{" "}
                      {formatDate(audit.createdAt)}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <SuperAdminRecoveryPanel
            configured={superAdminRecoveryConfigured()}
            protectedAdmins={protectedAdminStatuses.map((item) => ({
              ...item,
              user: item.user
                ? {
                    ...item.user,
                    suspendedAt: item.user.suspendedAt?.toISOString() ?? null,
                    accessRevokedAt: item.user.accessRevokedAt?.toISOString() ?? null,
                    deletedAt: item.user.deletedAt?.toISOString() ?? null,
                    updatedAt: item.user.updatedAt.toISOString()
                  }
                : null
            }))}
          />

          <CompanyInvitationsPanel
            invitations={invitations.map((invitation) => ({
              id: invitation.id,
              email: invitation.email,
              acceptedAt: invitation.acceptedAt?.toISOString() ?? null,
              revokedAt: invitation.revokedAt?.toISOString() ?? null,
              createdAt: invitation.createdAt.toISOString(),
              isAdminProtected: protectedAdminInvitationEmails.has(invitation.email.toLowerCase()),
              invitedBy: invitation.invitedBy,
              acceptedBy: invitation.acceptedBy
            }))}
          />

          <section className="rounded-lg border border-ink/10 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-moss" />
                <h2 className="text-sm font-semibold">Workspaces</h2>
              </div>
              <Badge>{workspaces.length}</Badge>
            </div>
            <div className="divide-y divide-ink/10">
              {workspaces.map((workspace) => (
                <Link key={workspace.id} className="block px-4 py-3 transition hover:bg-mint/35" href={`/dashboard/workspaces/${workspace.id}`}>
                  <p className="text-sm font-medium text-ink">{workspace.name}</p>
                  <p className="mt-1 text-xs text-ink/50">
                    {workspace._count.members} members - {workspace._count.files} files - {workspace._count.chatChannels} channels
                  </p>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-ink/10 bg-white">
            <div className="flex items-center gap-2 border-b border-ink/10 px-4 py-3">
              <CalendarClock className="h-4 w-4 text-moss" />
              <h2 className="text-sm font-semibold">Calls and meetings</h2>
            </div>
            <div className="divide-y divide-ink/10">
              {meetings.length === 0 ? <p className="px-4 py-8 text-sm text-ink/55">No calls or meetings yet.</p> : null}
              {meetings.map((meeting) => (
                <Link
                  key={meeting.id}
                  className="block px-4 py-3 transition hover:bg-mint/35"
                  href={`/dashboard/workspaces/${meeting.workspaceId}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 truncate text-sm font-medium text-ink">{meeting.title}</p>
                    <Badge className={meeting.approvalStatus === "PENDING" ? "bg-wheat" : meeting.cancelledAt ? "bg-clay/10 text-clay" : "bg-mint"}>
                      {meeting.cancelledAt ? "cancelled" : meeting.approvalStatus.toLowerCase()}
                    </Badge>
                  </div>
                    <p className="mt-1 text-xs text-ink/50">
                      {meeting.meetingType === "AUDIO" ? "Audio call" : "Video meeting"} - {meeting.workspace.name} -{" "}
                      {formatDate(meeting.startsAt)}
                    </p>
                </Link>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-ink/10 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-moss" />
                <h2 className="text-sm font-semibold">Activity logs</h2>
              </div>
              <ClearOrganizationActivityButton />
            </div>
            <div className="divide-y divide-ink/10">
              {activities.map((activity) => (
                <div key={activity.id} className="px-4 py-3 text-sm">
                  <p className="font-medium text-ink">{activity.user?.name ?? activity.user?.email ?? "System"}</p>
                  <p className="mt-1 text-xs text-ink/50">
                    {activity.action} - {activity.workspace?.name ?? "organization"} - {formatDate(activity.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
