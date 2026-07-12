import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { BookOpen, CalendarDays, ChevronRight, ClipboardCheck, FileText, KeyRound, MessageSquareText, UsersRound } from "lucide-react";
import { WorkspaceRole } from "@prisma/client";

import { auth } from "@/auth";
import { ActivityList } from "@/components/dashboard/activity-list";
import { AnnouncementsPanel } from "@/components/dashboard/announcements-panel";
import { ApprovalQueue } from "@/components/dashboard/approval-queue";
import { ChatPanel } from "@/components/dashboard/chat-panel";
import { CopyTextButton } from "@/components/dashboard/copy-text-button";
import { DirectMessagesPanel } from "@/components/dashboard/direct-messages-panel";
import { FileTable } from "@/components/dashboard/file-table";
import { FileUpload } from "@/components/dashboard/file-upload";
import { FolderCreateForm } from "@/components/dashboard/folder-create-form";
import { FormsPanel } from "@/components/dashboard/forms-panel";
import { IntegrationsPanel } from "@/components/dashboard/integrations-panel";
import { KnowledgeBasePanel } from "@/components/dashboard/knowledge-base-panel";
import { MeetingsPanel } from "@/components/dashboard/meetings-panel";
import { MembersPanel } from "@/components/dashboard/members-panel";
import { RolePermissionsPanel } from "@/components/dashboard/role-permissions-panel";
import { TasksPanel } from "@/components/dashboard/tasks-panel";
import { WorkspaceDepartmentAccessPanel } from "@/components/dashboard/workspace-department-access-panel";
import { WorkspaceDangerZone } from "@/components/dashboard/workspace-danger-zone";
import { WorkspacePresence } from "@/components/dashboard/workspace-presence";
import { WorkflowBuilder } from "@/components/dashboard/workflow-builder";
import { Badge } from "@/components/ui/badge";
import { getOrCreateGeneralChannel } from "@/lib/chat";
import { canApproveWorkspaceContent } from "@/lib/governance";
import { meetingInclude, serializeMeeting } from "@/lib/meetings";
import { prisma } from "@/lib/prisma";
import { defaultPermissionsForRole, getRolePermissions, hasAnyWorkspaceAdminRole } from "@/lib/rbac";
import { roleLabel } from "@/lib/roles";

type WorkspacePageProps = {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{ folder?: string }>;
};

async function getFolderTrail(folderId: string | null, workspaceId: string) {
  if (!folderId) {
    return [];
  }

  const folders: { id: string; name: string; parentId: string | null }[] = [];
  let currentId: string | null = folderId;

  for (let depth = 0; currentId && depth < 20; depth += 1) {
    const folder: { id: string; name: string; parentId: string | null } | null = await prisma.folder.findFirst({
      where: {
        id: currentId,
        workspaceId,
        deletedAt: null
      },
      select: {
        id: true,
        name: true,
        parentId: true
      }
    });

    if (!folder) {
      return null;
    }

    folders.unshift(folder);
    currentId = folder.parentId;
  }

  return folders;
}

export default async function WorkspacePage({ params, searchParams }: WorkspacePageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const { workspaceId } = await params;
  const { folder } = await searchParams;
  const folderId = folder ?? null;

  let membership = await prisma.workspaceMember.findUnique({
    where: {
      userId_workspaceId: {
        userId: session.user.id,
        workspaceId
      }
    },
    include: {
      workspace: true
    }
  });
  const isGlobalAdmin = await hasAnyWorkspaceAdminRole(session.user.id);

  if (membership?.workspace.deletedAt) {
    notFound();
  }

  if (!membership) {
    if (!isGlobalAdmin) {
      notFound();
    }

    const workspace = await prisma.workspace.findFirst({
      where: { id: workspaceId, deletedAt: null }
    });

    if (!workspace) {
      notFound();
    }

    membership = {
      id: `global-admin-${workspace.id}`,
      userId: session.user.id,
      workspaceId: workspace.id,
      role: WorkspaceRole.ADMIN,
      joinedAt: workspace.createdAt,
      workspace
    };
  }

  const folderTrail = await getFolderTrail(folderId, workspaceId);

  if (folderTrail === null) {
    notFound();
  }

  await getOrCreateGeneralChannel(workspaceId, membership.workspace.createdById);
  const hasAdminAccess = isGlobalAdmin || membership.role === WorkspaceRole.ADMIN;
  const permissions = hasAdminAccess
    ? defaultPermissionsForRole(WorkspaceRole.ADMIN)
    : await getRolePermissions(workspaceId, membership.role);
  const canApproveContent = await canApproveWorkspaceContent(session.user.id, workspaceId);

  const [folders, files, members, activities, announcements, tasks, meetings, approvals, departments, departmentAccess] = await Promise.all([
    prisma.folder.findMany({
      where: {
        workspaceId,
        parentId: folderId,
        deletedAt: null
      },
      orderBy: {
        name: "asc"
      }
    }),
    prisma.file.findMany({
      where: canApproveContent
        ? {
            workspaceId,
            folderId,
            deletedAt: null
          }
        : {
            workspaceId,
            folderId,
            deletedAt: null,
            OR: [{ approvalStatus: "APPROVED" }, { uploadedById: session.user.id }]
          },
      include: {
        uploadedBy: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    }),
    prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: {
        user: {
          select: {
            name: true,
            email: true,
            image: true
          }
        }
      },
      orderBy: {
        joinedAt: "asc"
      }
    }),
    prisma.activityLog.findMany({
      where: { workspaceId },
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
      take: 8
    }),
    prisma.workspaceAnnouncement.findMany({
      where: canApproveContent
        ? { workspaceId }
        : {
            workspaceId,
            OR: [{ approvalStatus: "APPROVED" }, { authorId: session.user.id }]
          },
      include: {
        author: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 10
    }),
    prisma.workspaceTask.findMany({
      where: canApproveContent
        ? { workspaceId }
        : {
            workspaceId,
            OR: [
              { approvalStatus: "APPROVED" },
              { createdById: session.user.id },
              { assignedToId: session.user.id },
              { assignees: { some: { userId: session.user.id } } }
            ]
          },
      include: {
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        createdBy: {
          select: {
            name: true,
            email: true
          }
        },
        assignees: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        },
        comments: {
          include: {
            author: {
              select: {
                name: true,
                email: true
              }
            }
          },
          orderBy: { createdAt: "desc" },
          take: 5
        }
      },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      take: 50
    }),
    prisma.workspaceMeeting.findMany({
      where: canApproveContent
        ? { workspaceId }
        : {
            workspaceId,
            OR: [{ approvalStatus: "APPROVED" }, { createdById: session.user.id }]
          },
      include: meetingInclude,
      orderBy: [{ startsAt: "asc" }, { createdAt: "desc" }],
      take: 100
    }),
    canApproveContent
      ? prisma.approvalRequest.findMany({
          where: { workspaceId },
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
          take: 50
        })
      : Promise.resolve([]),
    hasAdminAccess
      ? prisma.department.findMany({
          select: {
            id: true,
            name: true,
            kind: true
          },
          orderBy: [{ kind: "asc" }, { name: "asc" }]
        })
      : Promise.resolve([]),
    hasAdminAccess
      ? prisma.workspaceDepartmentAccess.findMany({
          where: { workspaceId },
          select: {
            id: true,
            departmentId: true,
            canAccessWorkspace: true,
            canAccessChat: true
          }
        })
      : Promise.resolve([])
  ]);

  const channels = await prisma.chatChannel.findMany({
    where: { workspaceId },
    include: {
      _count: {
        select: { messages: true }
      }
    },
    orderBy: { createdAt: "asc" }
  });
  const activeChannelId = channels[0]?.id;
  const [initialMessages, integrations, rolePermissionRows, directConversations] = await Promise.all([
    activeChannelId
      ? prisma.chatMessage.findMany({
          where: { channelId: activeChannelId },
          include: {
            author: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true
              }
            },
            attachmentFile: {
              select: {
                id: true,
                fileName: true,
                fileType: true,
                size: true
              }
            }
          },
          orderBy: { createdAt: "desc" },
          take: 50
        })
      : Promise.resolve([]),
    permissions.canManageIntegrations
      ? prisma.integration.findMany({
          where: { workspaceId },
          include: {
            channel: {
              select: {
                id: true,
                name: true
              }
            }
          },
          orderBy: { createdAt: "desc" }
        })
      : Promise.resolve([]),
    hasAdminAccess
      ? prisma.workspaceRolePermission.findMany({
          where: {
            workspaceId,
            role: {
              in: [WorkspaceRole.LEADER, WorkspaceRole.MODERATOR]
            }
          }
        })
      : Promise.resolve([]),
    prisma.directConversation.findMany({
      where: {
        workspaceId,
        OR: [{ participantAId: session.user.id }, { participantBId: session.user.id }]
      },
      include: {
        participantA: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        },
        participantB: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        },
        messages: {
          orderBy: {
            createdAt: "desc"
          },
          take: 25,
          include: {
            author: {
              select: {
                id: true,
                name: true,
                email: true,
                image: true
              }
            }
          }
        }
      },
      orderBy: [{ lastMessageAt: "desc" }, { updatedAt: "desc" }],
      take: 20
    })
  ]);
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  const origin = process.env.AUTH_URL ?? `${protocol}://${host}`;
  const configurableRolePermissions = [WorkspaceRole.LEADER, WorkspaceRole.MODERATOR].map((role) => {
    const saved = rolePermissionRows.find((row) => row.role === role);
    const defaults = defaultPermissionsForRole(role);

    return {
      role,
      canUploadFiles: saved?.canUploadFiles ?? defaults.canUploadFiles,
      canDeleteFiles: saved?.canDeleteFiles ?? defaults.canDeleteFiles,
      canCreateFolders: saved?.canCreateFolders ?? defaults.canCreateFolders,
      canCreateChannels: saved?.canCreateChannels ?? defaults.canCreateChannels,
      canSendMessages: saved?.canSendMessages ?? defaults.canSendMessages,
      canManageMembers: saved?.canManageMembers ?? defaults.canManageMembers,
      canManageIntegrations: saved?.canManageIntegrations ?? defaults.canManageIntegrations,
      canViewActivity: saved?.canViewActivity ?? defaults.canViewActivity,
      canClearActivity: saved?.canClearActivity ?? defaults.canClearActivity,
      canCreateAnnouncements: saved?.canCreateAnnouncements ?? defaults.canCreateAnnouncements,
      canManageTasks: saved?.canManageTasks ?? defaults.canManageTasks,
      canScheduleMeetings: saved?.canScheduleMeetings ?? defaults.canScheduleMeetings,
      canCreateShareLinks: saved?.canCreateShareLinks ?? defaults.canCreateShareLinks,
      canUseWhatsAppCommandBot: saved?.canUseWhatsAppCommandBot ?? defaults.canUseWhatsAppCommandBot,
      canManageDigitalSignatures: saved?.canManageDigitalSignatures ?? defaults.canManageDigitalSignatures,
        canManageEvidenceVault: saved?.canManageEvidenceVault ?? defaults.canManageEvidenceVault,
        canViewExecutiveBriefing: saved?.canViewExecutiveBriefing ?? defaults.canViewExecutiveBriefing,
        canDeleteReports: saved?.canDeleteReports ?? defaults.canDeleteReports,
        canClearReportLogs: saved?.canClearReportLogs ?? defaults.canClearReportLogs,
        canManagePresidentialActions: saved?.canManagePresidentialActions ?? defaults.canManagePresidentialActions,
        canManageMediaArchive: saved?.canManageMediaArchive ?? defaults.canManageMediaArchive,
        canUseExecutiveSecretary: saved?.canUseExecutiveSecretary ?? defaults.canUseExecutiveSecretary
      };
    });

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge>{roleLabel(membership.role)}</Badge>
              <span className="inline-flex items-center gap-1 text-xs text-ink/55">
                <UsersRound className="h-3.5 w-3.5" />
                {members.length} members
              </span>
            </div>
            <h1 className="text-3xl font-semibold text-ink">{membership.workspace.name}</h1>
            {membership.workspace.description ? (
              <p className="mt-2 max-w-3xl text-sm text-ink/60">{membership.workspace.description}</p>
            ) : null}
          </div>
          {hasAdminAccess ? (
            <div className="space-y-3 rounded-md border border-ink/10 bg-paper px-3 py-2 text-sm text-ink/70">
              <div>
                <p className="mb-1 flex items-center gap-2 font-medium text-ink">
                  <KeyRound className="h-4 w-4 text-moss" />
                  Join code
                </p>
                <div className="flex items-center gap-2">
                  <code className="max-w-[14rem] overflow-hidden text-ellipsis whitespace-nowrap rounded bg-white px-2 py-1 text-xs">
                    {membership.workspace.joinCode}
                  </code>
                  <CopyTextButton value={membership.workspace.joinCode} />
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs font-medium uppercase text-ink/50">Workspace ID</p>
                <div className="flex items-center gap-2">
                  <code className="max-w-[14rem] overflow-hidden text-ellipsis whitespace-nowrap rounded bg-white px-2 py-1 text-xs">
                    {membership.workspace.id}
                  </code>
                  <CopyTextButton value={membership.workspace.id} />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className="rounded-lg border border-ink/10 bg-white p-4">
        <div className="mb-3">
          <p className="text-sm font-semibold text-ink">Workspace tools</p>
          <p className="mt-1 text-xs text-ink/55">Jump straight to the workspace area you want to use.</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
          {[
            {
              href: "#documents",
              label: "Documents",
              detail: "Files, folders, uploads, previews",
              icon: FileText
            },
            {
              href: "#knowledge",
              label: "Knowledge",
              detail: "Doctrines, policies, manuals, FAQs",
              icon: BookOpen
            },
            {
              href: "#forms",
              label: "Forms",
              detail: "Workspace forms and responses",
              icon: ClipboardCheck
            },
            {
              href: "#meetings",
              label: "Meetings",
              detail: "Video, audio, notes, schedules",
              icon: CalendarDays
            },
            {
              href: "#chat",
              label: "Chat",
              detail: "Channels and direct messages",
              icon: MessageSquareText
            }
          ].map((item) => {
            const Icon = item.icon;

            return (
              <a className="rounded-md border border-ink/10 bg-paper p-3 transition hover:bg-mint/40" href={item.href} key={item.href}>
                <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <Icon className="h-4 w-4 text-moss" />
                  {item.label}
                </span>
                <span className="mt-1 block text-xs text-ink/55">{item.detail}</span>
              </a>
            );
          })}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <div id="documents" className="scroll-mt-24 rounded-lg border border-ink/10 bg-white p-4">
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm text-ink/60">
              <Link className="font-medium text-moss hover:underline" href={`/dashboard/workspaces/${workspaceId}`}>
                Files
              </Link>
              {folderTrail.map((folderItem) => (
                <span key={folderItem.id} className="inline-flex items-center gap-2">
                  <ChevronRight className="h-4 w-4 text-ink/35" />
                  <Link
                    className="font-medium text-moss hover:underline"
                    href={`/dashboard/workspaces/${workspaceId}?folder=${folderItem.id}`}
                  >
                    {folderItem.name}
                  </Link>
                </span>
              ))}
            </div>
            <div className="space-y-3">
              <FileUpload workspaceId={workspaceId} folderId={folderId} disabled={!permissions.canUploadFiles} />
              <FolderCreateForm
                workspaceId={workspaceId}
                parentId={folderId}
                disabled={!permissions.canCreateFolders}
              />
            </div>
          </div>

          <FileTable
            workspaceId={workspaceId}
            folders={folders.map((folderItem) => ({
              id: folderItem.id,
              name: folderItem.name,
              createdAt: folderItem.createdAt.toISOString()
            }))}
            files={files.map((file) => ({
              id: file.id,
              fileName: file.fileName,
              fileType: file.fileType,
              size: file.size,
              createdAt: file.createdAt.toISOString(),
              approvalStatus: file.approvalStatus,
              rejectedReason: file.rejectedReason,
              currentVersionNumber: file.currentVersionNumber,
              checkedOutById: file.checkedOutById,
              legalHold: file.legalHold,
              retentionUntil: file.retentionUntil?.toISOString() ?? null,
              scanStatus: file.scanStatus,
              uploadedBy: file.uploadedBy
            }))}
            canDeleteFiles={permissions.canDeleteFiles}
            canCreateShareLinks={permissions.canCreateShareLinks}
            canUploadFiles={permissions.canUploadFiles}
            canManageGovernance={hasAdminAccess}
          />

          <KnowledgeBasePanel
            workspaceId={workspaceId}
            canManage={permissions.canCreateAnnouncements}
          />

          <div id="forms" className="scroll-mt-24">
            <FormsPanel
              workspaceId={workspaceId}
              canManage={permissions.canCreateAnnouncements}
            />
          </div>

          <TasksPanel
            workspaceId={workspaceId}
            tasks={tasks.map((task) => ({
              id: task.id,
              title: task.title,
              description: task.description,
              status: task.status,
              priority: task.priority,
              approvalStatus: task.approvalStatus,
              rejectedReason: task.rejectedReason,
              dueDate: task.dueDate?.toISOString() ?? null,
              reminderAt: task.reminderAt?.toISOString() ?? null,
              assignedTo: task.assignedTo,
              assignees: task.assignees.map((assignee) => ({
                userId: assignee.userId,
                user: assignee.user
              })),
              comments: task.comments.map((comment) => ({
                id: comment.id,
                body: comment.body,
                createdAt: comment.createdAt.toISOString(),
                author: comment.author
              })),
              createdBy: task.createdBy,
              createdAt: task.createdAt.toISOString()
            }))}
            members={members.map((member) => ({
              userId: member.userId,
              user: member.user
            }))}
            canManage={permissions.canManageTasks}
          />

          <div id="meetings" className="scroll-mt-24">
            <MeetingsPanel
              workspaceId={workspaceId}
              meetings={meetings.map((meeting) => serializeMeeting(meeting, session.user.id, origin))}
              canSchedule={permissions.canScheduleMeetings}
              canCancel={hasAdminAccess}
            />
          </div>

          <div id="chat" className="scroll-mt-24">
            <ChatPanel
              workspaceId={workspaceId}
              currentUserId={session.user.id}
              channels={channels.map((channel) => ({
                id: channel.id,
                name: channel.name,
                description: channel.description,
                _count: channel._count
              }))}
              initialMessages={initialMessages.reverse().map((message) => ({
                id: message.id,
                body: message.body,
                externalAuthor: message.externalAuthor,
                createdAt: message.createdAt.toISOString(),
                editedAt: message.editedAt?.toISOString() ?? null,
                deletedAt: message.deletedAt?.toISOString() ?? null,
                voiceStorageKey: message.voiceStorageKey,
                voiceMimeType: message.voiceMimeType,
                voiceSize: message.voiceSize,
                voiceDurationMs: message.voiceDurationMs,
                replyToId: message.replyToId,
                forwardedFromId: message.forwardedFromId,
                author: message.author,
                attachmentFile: message.attachmentFile
              }))}
              canCreateChannels={permissions.canCreateChannels}
              canDeleteChannels={hasAdminAccess}
              canSendMessages={permissions.canSendMessages}
            />
          </div>

          <DirectMessagesPanel
            workspaceId={workspaceId}
            currentUserId={session.user.id}
            members={members.map((member) => ({
              userId: member.userId,
              user: member.user
            }))}
            conversations={directConversations.map((conversation) => ({
              id: conversation.id,
              participantAId: conversation.participantAId,
              participantBId: conversation.participantBId,
              participantA: conversation.participantA,
              participantB: conversation.participantB,
              updatedAt: conversation.updatedAt.toISOString(),
              lastMessageAt: conversation.lastMessageAt?.toISOString() ?? null,
              messages: conversation.messages.reverse().map((message) => ({
                id: message.id,
                body: message.body,
                createdAt: message.createdAt.toISOString(),
                editedAt: message.editedAt?.toISOString() ?? null,
                deletedAt: message.deletedAt?.toISOString() ?? null,
                voiceStorageKey: message.voiceStorageKey,
                voiceMimeType: message.voiceMimeType,
                voiceSize: message.voiceSize,
                voiceDurationMs: message.voiceDurationMs,
                replyToId: message.replyToId,
                forwardedFromId: message.forwardedFromId,
                author: message.author
              }))
            }))}
            canSendMessages={permissions.canSendMessages}
          />
        </div>

        <div className="space-y-4">
          <WorkspacePresence workspaceId={workspaceId} />

          <AnnouncementsPanel
            workspaceId={workspaceId}
            announcements={announcements.map((announcement) => ({
              id: announcement.id,
              title: announcement.title,
              body: announcement.body,
              pinned: announcement.pinned,
              approvalStatus: announcement.approvalStatus,
              rejectedReason: announcement.rejectedReason,
              author: announcement.author,
              createdAt: announcement.createdAt.toISOString()
            }))}
            canCreate={permissions.canCreateAnnouncements}
          />

          {canApproveContent ? (
            <ApprovalQueue
              compact
              title="Workspace approvals"
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
          ) : null}

          <MembersPanel
            workspaceId={workspaceId}
            canManage={hasAdminAccess || permissions.canManageMembers}
            members={members.map((member) => ({
              id: member.id,
              userId: member.userId,
              role: member.role,
              user: member.user
            }))}
          />

          {permissions.canViewActivity ? (
            <ActivityList
              workspaceId={workspaceId}
              canClear={permissions.canClearActivity}
              items={activities.map((activity) => ({
                id: activity.id,
                action: activity.action,
                createdAt: activity.createdAt.toISOString(),
                user: activity.user
              }))}
            />
          ) : null}

          <IntegrationsPanel
            workspaceId={workspaceId}
            channels={channels.map((channel) => ({
              id: channel.id,
              name: channel.name
            }))}
            integrations={integrations.map((integration) => ({
              id: integration.id,
              name: integration.name,
              enabled: integration.enabled,
              channel: integration.channel,
              webhookUrl: `${origin}/api/integrations/webhooks/${integration.webhookSecret}`
            }))}
            canManage={permissions.canManageIntegrations}
          />

          {hasAdminAccess ? (
            <RolePermissionsPanel workspaceId={workspaceId} permissions={configurableRolePermissions} />
          ) : null}

          {hasAdminAccess ? <WorkflowBuilder workspaceId={workspaceId} /> : null}

          {hasAdminAccess ? (
            <WorkspaceDepartmentAccessPanel
              workspaceId={workspaceId}
              departments={departments.map((department) => ({
                id: department.id,
                name: department.name,
                kind: department.kind
              }))}
              access={departmentAccess}
            />
          ) : null}

          {hasAdminAccess ? (
            <WorkspaceDangerZone workspaceId={workspaceId} workspaceName={membership.workspace.name} />
          ) : null}
        </div>
      </section>
    </div>
  );
}
