import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ChevronRight, KeyRound, UsersRound } from "lucide-react";
import { WorkspaceRole } from "@prisma/client";

import { auth } from "@/auth";
import { ActivityList } from "@/components/dashboard/activity-list";
import { AnnouncementsPanel } from "@/components/dashboard/announcements-panel";
import { ChatPanel } from "@/components/dashboard/chat-panel";
import { CopyTextButton } from "@/components/dashboard/copy-text-button";
import { DirectMessagesPanel } from "@/components/dashboard/direct-messages-panel";
import { FileTable } from "@/components/dashboard/file-table";
import { FileUpload } from "@/components/dashboard/file-upload";
import { FolderCreateForm } from "@/components/dashboard/folder-create-form";
import { IntegrationsPanel } from "@/components/dashboard/integrations-panel";
import { MembersPanel } from "@/components/dashboard/members-panel";
import { RolePermissionsPanel } from "@/components/dashboard/role-permissions-panel";
import { TasksPanel } from "@/components/dashboard/tasks-panel";
import { WorkspaceDangerZone } from "@/components/dashboard/workspace-danger-zone";
import { Badge } from "@/components/ui/badge";
import { getOrCreateGeneralChannel } from "@/lib/chat";
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
        workspaceId
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

  if (!membership) {
    if (!isGlobalAdmin) {
      notFound();
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId }
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

  const [folders, files, members, activities, announcements, tasks] = await Promise.all([
    prisma.folder.findMany({
      where: {
        workspaceId,
        parentId: folderId
      },
      orderBy: {
        name: "asc"
      }
    }),
    prisma.file.findMany({
      where: {
        workspaceId,
        folderId
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
      where: { workspaceId },
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
      where: { workspaceId },
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
        }
      },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      take: 50
    })
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
                name: true,
                email: true
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
      canCreateAnnouncements: saved?.canCreateAnnouncements ?? defaults.canCreateAnnouncements,
      canManageTasks: saved?.canManageTasks ?? defaults.canManageTasks,
      canCreateShareLinks: saved?.canCreateShareLinks ?? defaults.canCreateShareLinks
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

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-4">
          <div className="rounded-lg border border-ink/10 bg-white p-4">
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
              uploadedBy: file.uploadedBy
            }))}
            canDeleteFiles={permissions.canDeleteFiles}
            canCreateShareLinks={permissions.canCreateShareLinks}
          />

          <TasksPanel
            workspaceId={workspaceId}
            tasks={tasks.map((task) => ({
              id: task.id,
              title: task.title,
              description: task.description,
              status: task.status,
              dueDate: task.dueDate?.toISOString() ?? null,
              assignedTo: task.assignedTo,
              createdBy: task.createdBy,
              createdAt: task.createdAt.toISOString()
            }))}
            members={members.map((member) => ({
              userId: member.userId,
              user: member.user
            }))}
            canManage={permissions.canManageTasks}
          />

          <ChatPanel
            workspaceId={workspaceId}
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
              author: message.author,
              attachmentFile: message.attachmentFile
            }))}
            canCreateChannels={permissions.canCreateChannels}
            canDeleteChannels={hasAdminAccess}
            canSendMessages={permissions.canSendMessages}
          />

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
                author: message.author
              }))
            }))}
            canSendMessages={permissions.canSendMessages}
          />
        </div>

        <div className="space-y-4">
          <AnnouncementsPanel
            workspaceId={workspaceId}
            announcements={announcements.map((announcement) => ({
              id: announcement.id,
              title: announcement.title,
              body: announcement.body,
              pinned: announcement.pinned,
              author: announcement.author,
              createdAt: announcement.createdAt.toISOString()
            }))}
            canCreate={permissions.canCreateAnnouncements}
          />

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

          {hasAdminAccess ? (
            <WorkspaceDangerZone workspaceId={workspaceId} workspaceName={membership.workspace.name} />
          ) : null}
        </div>
      </section>
    </div>
  );
}
