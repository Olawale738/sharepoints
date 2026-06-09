import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  Building2,
  Database,
  Files,
  FolderPlus,
  Gauge,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UsersRound
} from "lucide-react";
import { TaskStatus, WorkspaceRole } from "@prisma/client";

import { auth } from "@/auth";
import { AdminUsersPanel } from "@/components/dashboard/admin-users-panel";
import { CompanyInvitationsPanel } from "@/components/dashboard/company-invitations-panel";
import { DashboardCommandCenter } from "@/components/dashboard/dashboard-command-center";
import { OrganizationChatPanel } from "@/components/dashboard/organization-chat-panel";
import { WorkspaceActions } from "@/components/dashboard/workspace-actions";
import { Badge } from "@/components/ui/badge";
import { ensureOrgChatRooms, getOrgChatAudienceCounts, getUserOrgChatAudiences } from "@/lib/org-chat";
import { prisma } from "@/lib/prisma";
import { roleLabel } from "@/lib/roles";
import { userAccessStatus } from "@/lib/user-access";
import { formatBytes, formatDate } from "@/lib/utils";

function canCreateWorkspaceFromRole(role: string) {
  return role === "ADMIN" || role === "LEADER" || role === "EDITOR";
}

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const ownMemberships = await prisma.workspaceMember.findMany({
    where: { userId: session.user.id },
    include: {
      workspace: {
        include: {
          _count: {
            select: {
              files: true,
              members: true
            }
          }
        }
      }
    },
    orderBy: {
      joinedAt: "asc"
    }
  });
  const isGlobalAdmin = ownMemberships.some((membership) => membership.role === WorkspaceRole.ADMIN);
  const globalWorkspaces = isGlobalAdmin
    ? await prisma.workspace.findMany({
        include: {
          members: {
            where: {
              userId: session.user.id
            },
            select: {
              id: true,
              userId: true,
              workspaceId: true,
              role: true,
              joinedAt: true
            }
          },
          _count: {
            select: {
              files: true,
              members: true
            }
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      })
    : [];
  const memberships = isGlobalAdmin
    ? globalWorkspaces.map((workspace) => {
        const ownMembership = workspace.members[0];

        return {
          id: ownMembership?.id ?? `global-admin-${workspace.id}`,
          userId: ownMembership?.userId ?? session.user.id,
          workspaceId: workspace.id,
          role: WorkspaceRole.ADMIN,
          joinedAt: ownMembership?.joinedAt ?? workspace.createdAt,
          workspace
        };
      })
    : ownMemberships;

  await ensureOrgChatRooms(session.user.id);
  const workspaceIds = memberships.map((membership) => membership.workspaceId);
  const [recentFiles, recentActivities, fileStats, channelCount, openTaskCount] = workspaceIds.length
    ? await Promise.all([
        prisma.file.findMany({
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
            uploadedBy: {
              select: {
                name: true,
                email: true
              }
            }
          },
          orderBy: {
            createdAt: "desc"
          },
          take: 6
        }),
        prisma.activityLog.findMany({
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
          take: 8
        }),
        prisma.file.aggregate({
          where: {
            workspaceId: {
              in: workspaceIds
            }
          },
          _sum: {
            size: true
          },
          _count: {
            id: true
          }
        }),
        prisma.chatChannel.count({
          where: {
            workspaceId: {
              in: workspaceIds
            }
          }
        }),
        prisma.workspaceTask.count({
          where: {
            workspaceId: {
              in: workspaceIds
            },
            status: {
              not: TaskStatus.DONE
            }
          }
        })
      ])
    : [[], [], { _sum: { size: null }, _count: { id: 0 } }, 0, 0];
  const [{ readable: orgChatAudiences, sendable: sendableOrgChatAudiences }, orgChatAudienceCounts] =
    await Promise.all([getUserOrgChatAudiences(session.user.id), getOrgChatAudienceCounts()]);
  const orgChatRooms = orgChatAudiences.length
    ? await prisma.orgChatRoom.findMany({
        where: {
          audience: {
            in: orgChatAudiences
          }
        },
        include: {
          _count: {
            select: {
              messages: true
            }
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      })
    : [];
  const activeOrgChatRoomId = orgChatRooms[0]?.id;
  const initialOrgChatMessages = activeOrgChatRoomId
    ? await prisma.orgChatMessage.findMany({
        where: {
          roomId: activeOrgChatRoomId
        },
        include: {
          author: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        take: 50
      })
    : [];

  const adminMemberships = memberships.filter((membership) => membership.role === "ADMIN");
  const leaderMemberships = memberships.filter((membership) => membership.role === "LEADER" || membership.role === "EDITOR");
  const moderatorMemberships = memberships.filter((membership) => membership.role === "MODERATOR");
  const userMemberships = memberships.filter((membership) => membership.role === "USER" || membership.role === "VIEWER");
  const canCreateWorkspace = isGlobalAdmin || ownMemberships.some((membership) => canCreateWorkspaceFromRole(membership.role));
  const filesCount = memberships.reduce((total, membership) => total + membership.workspace._count.files, 0);
  const memberSeats = memberships.reduce((total, membership) => total + membership.workspace._count.members, 0);
  const roleDashboards = [
    {
      title: "Admin dashboard",
      description: "Full control over members, permissions, files, chat, and integrations.",
      memberships: adminMemberships,
      empty: "You are not an admin of any workspace yet."
    },
    {
      title: "Leader dashboard",
      description: "Leadership spaces with the permissions set by workspace admins.",
      memberships: leaderMemberships,
      empty: "No leader workspaces assigned yet."
    },
    {
      title: "Moderator dashboard",
      description: "Moderation spaces for day-to-day collaboration and oversight.",
      memberships: moderatorMemberships,
      empty: "No moderator workspaces assigned yet."
    },
    {
      title: "User dashboard",
      description: "Ordinary user spaces for documents, chat, and read access.",
      memberships: userMemberships,
      empty: "No ordinary user workspaces yet."
    }
  ];
  const companyInvitations = isGlobalAdmin
    ? await prisma.companyEmailInvitation.findMany({
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
        take: 100
      })
    : [];
  const adminUsers = isGlobalAdmin
    ? await prisma.user.findMany({
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          createdAt: true,
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
        take: 250
      })
    : [];
  const protectedAdminInvitationEmails = new Set([
    (process.env.SEED_ADMIN_EMAIL ?? "president@letw.org").toLowerCase(),
    ...adminUsers
      .filter((adminUser) => adminUser.workspaceMemberships.some((membership) => membership.role === "ADMIN"))
      .map((adminUser) => adminUser.email?.toLowerCase())
      .filter((email): email is string => Boolean(email))
  ]);
  const storageBytes = fileStats._sum.size ?? 0;
  const pendingInvitations = companyInvitations.filter((invitation) => !invitation.acceptedAt && !invitation.revokedAt).length;
  const workspacePulse = memberships
    .map((membership) => {
      const filesScore = Math.min(35, membership.workspace._count.files * 7);
      const membersScore = Math.min(35, membership.workspace._count.members * 7);
      const roleScore = membership.role === WorkspaceRole.ADMIN ? 20 : membership.role === WorkspaceRole.LEADER ? 14 : 8;
      const score = Math.min(100, 20 + filesScore + membersScore + roleScore);

      return {
        id: membership.id,
        workspaceId: membership.workspace.id,
        name: membership.workspace.name,
        role: membership.role,
        score,
        filesCount: membership.workspace._count.files,
        membersCount: membership.workspace._count.members,
        status: score >= 82 ? "Thriving" : score >= 60 ? "Healthy" : "Needs setup"
      };
    })
    .sort((first, second) => second.score - first.score)
    .slice(0, 6);
  const metricCards = [
    {
      label: "Workspaces",
      value: memberships.length,
      detail: `${adminMemberships.length} admin spaces`,
      icon: Building2,
      className: "bg-white"
    },
    {
      label: "Documents",
      value: filesCount,
      detail: formatBytes(storageBytes),
      icon: Files,
      className: "bg-white"
    },
    {
      label: "Members",
      value: memberSeats,
      detail: `${pendingInvitations} pending invites`,
      icon: UsersRound,
      className: "bg-white"
    },
    {
      label: "Open work",
      value: openTaskCount,
      detail: `${channelCount} chat channels`,
      icon: Gauge,
      className: "bg-navy text-white"
    }
  ];

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-lg border border-ink/10 bg-white shadow-panel">
        <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <ShieldCheck className="h-4 w-4" />
              Secure collaboration workspace
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">LETW collaboration center</h1>
            <p className="mt-2 max-w-3xl text-sm text-ink/60">
              A private SharePoint-style operating home for LETW files, teams, chat, invitations, permissions, and audit trails.
            </p>
          </div>
          <div className="w-full max-w-sm rounded-md border border-ink/10 bg-paper p-3">
            <WorkspaceActions canCreateWorkspace={canCreateWorkspace} />
          </div>
        </div>
        <div className="grid border-t border-ink/10 bg-navy text-white md:grid-cols-3">
          <div className="border-b border-white/10 px-5 py-4 md:border-b-0 md:border-r">
            <p className="flex items-center gap-2 text-sm font-medium text-gold">
              <Sparkles className="h-4 w-4" />
              Invitation-only
            </p>
            <p className="mt-1 text-xs text-white/65">Only invited @letw.org accounts can sign in.</p>
          </div>
          <div className="border-b border-white/10 px-5 py-4 md:border-b-0 md:border-r">
            <p className="flex items-center gap-2 text-sm font-medium text-gold">
              <Database className="h-4 w-4" />
              {formatBytes(storageBytes)} managed
            </p>
            <p className="mt-1 text-xs text-white/65">Documents are stored with workspace-level access checks.</p>
          </div>
          <div className="px-5 py-4">
            <p className="flex items-center gap-2 text-sm font-medium text-gold">
              <MessageSquareText className="h-4 w-4" />
              {channelCount} channels
            </p>
            <p className="mt-1 text-xs text-white/65">Workspace and organization chat stay permission-aware.</p>
          </div>
        </div>
      </section>

      <DashboardCommandCenter
        workspaces={memberships.map((membership) => ({
          id: membership.workspace.id,
          name: membership.workspace.name,
          role: membership.role,
          description: membership.workspace.description,
          filesCount: membership.workspace._count.files,
          membersCount: membership.workspace._count.members
        }))}
        recentFiles={recentFiles.map((file) => ({
          id: file.id,
          fileName: file.fileName,
          size: file.size,
          createdAt: file.createdAt.toISOString(),
          workspace: file.workspace
        }))}
        canCreateWorkspace={canCreateWorkspace}
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metricCards.map((metric) => {
          const Icon = metric.icon;
          const isDark = metric.className.includes("navy");

          return (
            <div key={metric.label} className={`rounded-lg border border-ink/10 p-4 shadow-soft ${metric.className}`}>
              <Icon className={`h-5 w-5 ${isDark ? "text-gold" : "text-moss"}`} />
              <p className={`mt-3 text-2xl font-semibold ${isDark ? "text-white" : "text-ink"}`}>{metric.value}</p>
              <p className={`text-sm ${isDark ? "text-white/65" : "text-ink/55"}`}>{metric.label}</p>
              <p className={`mt-2 text-xs ${isDark ? "text-white/60" : "text-ink/45"}`}>{metric.detail}</p>
            </div>
          );
        })}
      </section>

      {workspacePulse.length ? (
        <section className="rounded-lg border border-ink/10 bg-white p-4">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <TrendingUp className="h-4 w-4 text-moss" />
                Workspace health
              </p>
              <p className="mt-1 text-xs text-ink/55">A quick read on content, team size, and role coverage.</p>
            </div>
            <Badge className="bg-steel">{workspacePulse.length} tracked</Badge>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {workspacePulse.map((workspace) => (
              <Link
                key={workspace.id}
                href={`/dashboard/workspaces/${workspace.workspaceId}`}
                className="rounded-md border border-ink/10 bg-paper p-3 transition hover:bg-mint/40"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{workspace.name}</p>
                    <p className="mt-1 text-xs text-ink/50">
                      {workspace.filesCount} files - {workspace.membersCount} members - {roleLabel(workspace.role)}
                    </p>
                  </div>
                  <Badge className={workspace.score >= 82 ? "bg-mint" : workspace.score >= 60 ? "bg-wheat" : "bg-clay/10 text-clay"}>
                    {workspace.status}
                  </Badge>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white">
                  <div className="h-full rounded-full bg-moss" style={{ width: `${workspace.score}%` }} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-4">
        {roleDashboards.map((dashboard) => (
          <div key={dashboard.title} className="rounded-lg border border-ink/10 bg-white p-4">
            <h2 className="text-sm font-semibold text-ink">{dashboard.title}</h2>
            <p className="mt-1 min-h-10 text-xs text-ink/55">{dashboard.description}</p>
            <div className="mt-4 space-y-2">
              {dashboard.memberships.length === 0 ? (
                <p className="rounded-md bg-paper px-3 py-3 text-sm text-ink/55">{dashboard.empty}</p>
              ) : (
                dashboard.memberships.map((membership) => (
                  <Link
                    key={membership.id}
                    href={`/dashboard/workspaces/${membership.workspace.id}`}
                    className="block rounded-md border border-ink/10 bg-paper px-3 py-3 transition hover:bg-mint/35"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 truncate text-sm font-medium text-ink">{membership.workspace.name}</p>
                      <Badge className={membership.role === "ADMIN" ? "bg-wheat" : undefined}>
                        {roleLabel(membership.role)}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-ink/50">
                      {membership.workspace._count.files} files - {membership.workspace._count.members} members
                    </p>
                  </Link>
                ))
              )}
            </div>
          </div>
        ))}
      </section>

      {orgChatRooms.length ? (
        <OrganizationChatPanel
          currentUserId={session.user.id}
          rooms={orgChatRooms.map((room) => ({
            id: room.id,
            audience: room.audience,
            name: room.name,
            description: room.description,
            audienceMembersCount: orgChatAudienceCounts.get(room.audience) ?? 0,
            canSendMessages: sendableOrgChatAudiences.includes(room.audience),
            _count: room._count
          }))}
          initialMessages={initialOrgChatMessages.reverse().map((message) => ({
            id: message.id,
            body: message.body,
            createdAt: message.createdAt.toISOString(),
            author: message.author
          }))}
        />
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <div className="rounded-lg border border-ink/10 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-3">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-moss" />
                <h2 className="text-sm font-semibold">Your workspaces</h2>
              </div>
              <Badge>{memberships.length}</Badge>
            </div>

            {memberships.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <FolderPlus className="mx-auto h-8 w-8 text-moss" />
                <p className="mt-3 font-medium text-ink">No workspaces yet</p>
                <p className="mx-auto mt-2 max-w-md text-sm text-ink/55">
                  Create a workspace for a team or join one with an invite code.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-ink/10">
                {memberships.map((membership) => (
                  <Link
                    key={membership.id}
                    href={`/dashboard/workspaces/${membership.workspace.id}`}
                    className="flex flex-col gap-3 px-4 py-4 transition hover:bg-mint/35 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-ink">{membership.workspace.name}</p>
                        <Badge className={membership.role === "ADMIN" ? "bg-wheat" : undefined}>
                          {roleLabel(membership.role)}
                        </Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm text-ink/55">
                        {membership.workspace.description ?? "Workspace for documents, members, chat, and activity."}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-4 text-sm text-ink/55">
                      <span>{membership.workspace._count.files} files</span>
                      <span>{membership.workspace._count.members} members</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-ink/10 bg-white">
            <div className="flex items-center gap-2 border-b border-ink/10 px-4 py-3">
              <Files className="h-4 w-4 text-moss" />
              <h2 className="text-sm font-semibold">Recent files</h2>
            </div>
            {recentFiles.length === 0 ? (
              <p className="px-4 py-8 text-sm text-ink/55">No recent files yet.</p>
            ) : (
              <div className="divide-y divide-ink/10">
                {recentFiles.map((file) => (
                  <Link
                    key={file.id}
                    href={`/dashboard/workspaces/${file.workspace.id}`}
                    className="flex flex-col gap-2 px-4 py-3 transition hover:bg-mint/35 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{file.fileName}</p>
                      <p className="truncate text-xs text-ink/50">
                        {file.workspace.name} - {file.uploadedBy.name ?? file.uploadedBy.email}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-3 text-xs text-ink/50">
                      <span>{formatBytes(file.size)}</span>
                      <span>{formatDate(file.createdAt)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="space-y-6">
          {adminMemberships.length ? (
            <CompanyInvitationsPanel
              invitations={companyInvitations.map((invitation) => ({
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
          ) : null}

          {isGlobalAdmin ? (
            <AdminUsersPanel
              currentUserId={session.user.id}
              users={adminUsers.map((adminUser) => ({
                id: adminUser.id,
                name: adminUser.name,
                email: adminUser.email,
                image: adminUser.image,
                createdAt: adminUser.createdAt.toISOString(),
                suspendedAt: adminUser.suspendedAt?.toISOString() ?? null,
                accessRevokedAt: adminUser.accessRevokedAt?.toISOString() ?? null,
                deletedAt: adminUser.deletedAt?.toISOString() ?? null,
                isAdmin: adminUser.workspaceMemberships.some((membership) => membership.role === "ADMIN"),
                status: userAccessStatus(adminUser),
                _count: adminUser._count
              }))}
            />
          ) : null}

          <div className="rounded-lg border border-ink/10 bg-white p-4">
            <div className="mb-4 flex items-center gap-2">
              <Activity className="h-4 w-4 text-moss" />
              <h2 className="text-sm font-semibold">Recent activity</h2>
            </div>
            {recentActivities.length === 0 ? (
              <p className="text-sm text-ink/55">No activity yet.</p>
            ) : (
              <div className="space-y-3">
                {recentActivities.map((activity) => (
                  <div key={activity.id} className="text-sm">
                    <p className="text-ink">
                      <span className="font-medium">{activity.user?.name ?? activity.user?.email ?? "System"}</span>{" "}
                      <span>{activity.action.replaceAll("_", " ")}</span>
                    </p>
                    <p className="text-xs text-ink/50">
                      {activity.workspace?.name} - {formatDate(activity.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
