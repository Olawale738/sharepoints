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
    const [workspaces, files, folders, tasks, members, messages] = await Promise.all([
      prisma.workspace.findMany({
        where: {
          id: { in: workspaceIds },
          OR: [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }]
        },
        select: { id: true, name: true },
        take: 8
      }),
      prisma.file.findMany({
        where: {
          workspaceId: { in: workspaceIds },
          ...approvalFilter,
          fileName: { contains: q, mode: "insensitive" }
        },
        select: { id: true, fileName: true, workspaceId: true, workspace: { select: { name: true } } },
        take: 8
      }),
      prisma.folder.findMany({
        where: {
          workspaceId: { in: workspaceIds },
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
        }))
      ].slice(0, 30)
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
