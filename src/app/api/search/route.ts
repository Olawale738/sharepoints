import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { getAdminVisibleWorkspaceIds } from "@/lib/governance";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";
import { searchSchema } from "@/lib/validators";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const parsed = searchSchema.safeParse({ q: url.searchParams.get("q") ?? "" });

    if (!parsed.success) {
      throw new ApiError(422, "Enter a search term.");
    }

    const q = parsed.data.q;
    const isGlobalAdmin = await hasAnyWorkspaceAdminRole(user.id);
    const workspaceIds = await getAdminVisibleWorkspaceIds(user.id);

    if (!workspaceIds.length) {
      return ok({ results: [] });
    }

    const approvalFilter = isGlobalAdmin ? {} : { approvalStatus: "APPROVED" as const };
    const [workspaces, files, folders, tasks, members, messages, directMessages, orgMessages, wikiPages, forms, meetings] =
      await Promise.all([
      prisma.workspace.findMany({
        where: {
          id: { in: workspaceIds },
          deletedAt: null,
          OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }]
        },
        select: { id: true, name: true },
        take: 8
      }),
      prisma.file.findMany({
        where: {
          workspaceId: { in: workspaceIds },
          deletedAt: null,
          ...approvalFilter,
          fileName: { contains: q, mode: "insensitive" }
        },
        select: { id: true, fileName: true, workspaceId: true, workspace: { select: { name: true } } },
        take: 8
      }),
      prisma.folder.findMany({
        where: {
          workspaceId: { in: workspaceIds },
          deletedAt: null,
          name: { contains: q, mode: "insensitive" }
        },
        select: { id: true, name: true, workspaceId: true, workspace: { select: { name: true } } },
        take: 8
      }),
      prisma.workspaceTask.findMany({
        where: {
          workspaceId: { in: workspaceIds },
          ...approvalFilter,
          OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }]
        },
        select: { id: true, title: true, workspaceId: true, workspace: { select: { name: true } } },
        take: 8
      }),
      prisma.workspaceMember.findMany({
        where: {
          workspaceId: { in: workspaceIds },
          OR: [
            { user: { name: { contains: q, mode: "insensitive" } } },
            { user: { email: { contains: q, mode: "insensitive" } } }
          ]
        },
        select: {
          id: true,
          workspaceId: true,
          role: true,
          workspace: { select: { name: true } },
          user: { select: { name: true, email: true } }
        },
        take: 8
      }),
      prisma.chatMessage.findMany({
        where: {
          channel: { workspaceId: { in: workspaceIds } },
          deletedAt: null,
          body: { contains: q, mode: "insensitive" }
        },
        select: {
          id: true,
          body: true,
          channel: { select: { workspaceId: true, name: true, workspace: { select: { name: true } } } }
        },
        take: 8
      }),
      prisma.directMessage.findMany({
        where: {
          conversation: { workspaceId: { in: workspaceIds } },
          deletedAt: null,
          body: { contains: q, mode: "insensitive" }
        },
        select: {
          id: true,
          body: true,
          conversation: {
            select: {
              workspaceId: true,
              workspace: { select: { name: true } }
            }
          }
        },
        take: 8
      }),
      prisma.orgChatMessage.findMany({
        where: {
          deletedAt: null,
          body: { contains: q, mode: "insensitive" }
        },
        select: {
          id: true,
          body: true,
          room: { select: { name: true } }
        },
        take: 8
      }),
      prisma.wikiPage.findMany({
        where: {
          workspaceId: { in: workspaceIds },
          OR: [{ title: { contains: q, mode: "insensitive" } }, { content: { contains: q, mode: "insensitive" } }]
        },
        select: {
          id: true,
          title: true,
          workspaceId: true,
          workspace: { select: { name: true } }
        },
        take: 8
      }),
      prisma.workspaceForm.findMany({
        where: {
          workspaceId: { in: workspaceIds },
          OR: [{ title: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }]
        },
        select: {
          id: true,
          title: true,
          workspaceId: true,
          workspace: { select: { name: true } }
        },
        take: 8
      }),
      prisma.workspaceMeeting.findMany({
        where: {
          workspaceId: { in: workspaceIds },
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { transcript: { contains: q, mode: "insensitive" } },
            { transcriptSummary: { contains: q, mode: "insensitive" } }
          ]
        },
        select: {
          id: true,
          title: true,
          transcriptSummary: true,
          workspace: { select: { name: true } }
        },
        take: 8
      })
    ]);

    return ok({
      results: [
        ...workspaces.map((workspace) => ({
          type: "workspace",
          title: workspace.name,
          detail: "Workspace",
          href: `/dashboard/workspaces/${workspace.id}`
        })),
        ...files.map((file) => ({
          type: "file",
          title: file.fileName,
          detail: file.workspace.name,
          href: `/api/files/${file.id}/preview`
        })),
        ...folders.map((folder) => ({
          type: "folder",
          title: folder.name,
          detail: folder.workspace.name,
          href: `/dashboard/workspaces/${folder.workspaceId}?folder=${folder.id}`
        })),
        ...tasks.map((task) => ({
          type: "task",
          title: task.title,
          detail: task.workspace.name,
          href: `/dashboard/workspaces/${task.workspaceId}`
        })),
        ...members.map((member) => ({
          type: "member",
          title: member.user.name ?? member.user.email ?? "Member",
          detail: `${member.workspace.name} - ${member.role.toLowerCase()}`,
          href: `/dashboard/workspaces/${member.workspaceId}`
        })),
        ...messages.map((message) => ({
          type: "chat",
          title: message.body.slice(0, 80),
          detail: `${message.channel.workspace.name} - #${message.channel.name}`,
          href: `/dashboard/workspaces/${message.channel.workspaceId}`
        })),
        ...directMessages.map((message) => ({
          type: "direct chat",
          title: message.body.slice(0, 80),
          detail: message.conversation.workspace.name,
          href: `/dashboard/workspaces/${message.conversation.workspaceId}`
        })),
        ...orgMessages.map((message) => ({
          type: "organization chat",
          title: message.body.slice(0, 80),
          detail: message.room.name,
          href: "/dashboard"
        })),
        ...wikiPages.map((page) => ({
          type: "knowledge",
          title: page.title,
          detail: page.workspace.name,
          href: `/dashboard/workspaces/${page.workspaceId}`
        })),
        ...forms.map((form) => ({
          type: "form",
          title: form.title,
          detail: form.workspace.name,
          href: `/dashboard/workspaces/${form.workspaceId}`
        })),
        ...meetings.map((meeting) => ({
          type: "meeting transcript",
          title: meeting.title,
          detail: meeting.transcriptSummary?.slice(0, 120) ?? meeting.workspace.name,
          href: `/dashboard/meetings/${meeting.id}`
        }))
      ].slice(0, 30)
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
