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
    const [
      workspaces,
      files,
      folders,
      tasks,
      members,
      messages,
      directMessages,
      orgMessages,
      wikiPages,
      forms,
      meetings,
      officialLetters,
      certificates,
      policies,
      servicePlans,
      prayerAssignments,
      externalGuests
    ] = await Promise.all([
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
      }),
      prisma.officialLetter.findMany({
        where: {
          ...(isGlobalAdmin ? {} : { workspaceId: { in: workspaceIds } }),
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { letterNumber: { contains: q, mode: "insensitive" } },
            { recipientName: { contains: q, mode: "insensitive" } },
            { body: { contains: q, mode: "insensitive" } }
          ]
        },
        select: { id: true, title: true, letterNumber: true, status: true, recipientName: true, workspaceId: true },
        take: 8
      }),
      prisma.memberCertificationBadge.findMany({
        where: {
          ...(isGlobalAdmin ? {} : { userId: user.id }),
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { certificateNumber: { contains: q, mode: "insensitive" } }
          ]
        },
        select: { id: true, title: true, certificateNumber: true, status: true },
        take: 8
      }),
      prisma.policyDocument.findMany({
        where: {
          ...(isGlobalAdmin ? {} : { workspaceId: { in: workspaceIds }, status: "PUBLISHED" as const }),
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { summary: { contains: q, mode: "insensitive" } },
            { content: { contains: q, mode: "insensitive" } }
          ]
        },
        select: { id: true, title: true, summary: true, status: true, workspaceId: true },
        take: 8
      }),
      prisma.servicePlan.findMany({
        where: {
          ...(isGlobalAdmin ? {} : { workspaceId: { in: workspaceIds } }),
          OR: [
            { title: { contains: q, mode: "insensitive" } },
            { theme: { contains: q, mode: "insensitive" } },
            { preacher: { contains: q, mode: "insensitive" } },
            { prayerPoints: { contains: q, mode: "insensitive" } },
            { postServiceReport: { contains: q, mode: "insensitive" } }
          ]
        },
        select: { id: true, title: true, status: true, startsAt: true, workspaceId: true },
        take: 8
      }),
      prisma.prayerAssignment.findMany({
        where: {
          AND: [
            isGlobalAdmin
              ? {}
              : {
                  OR: [{ workspaceId: { in: workspaceIds } }, { assignedWorkspaceId: { in: workspaceIds } }, { assignedToUserId: user.id }]
                },
            {
              OR: [
                { title: { contains: q, mode: "insensitive" } },
                { prayerPoint: { contains: q, mode: "insensitive" } },
                { completionNotes: { contains: q, mode: "insensitive" } },
                { testimony: { contains: q, mode: "insensitive" } }
              ]
            }
          ]
        },
        select: { id: true, title: true, status: true, category: true },
        take: 8
      }),
      isGlobalAdmin
        ? prisma.externalGuestAccess.findMany({
            where: {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { organization: { contains: q, mode: "insensitive" } },
                { purpose: { contains: q, mode: "insensitive" } }
              ]
            },
            select: { id: true, name: true, email: true, status: true, expiresAt: true },
            take: 8
          })
        : Promise.resolve([])
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
        })),
        ...officialLetters.map((letter) => ({
          type: "official letter",
          title: letter.title,
          detail: `${letter.letterNumber} - ${letter.recipientName} - ${letter.status.toLowerCase()}`,
          href: "/dashboard/leadership-governance"
        })),
        ...certificates.map((certificate) => ({
          type: "certificate",
          title: certificate.title,
          detail: `${certificate.certificateNumber ?? "No certificate number"} - ${certificate.status.toLowerCase()}`,
          href: "/dashboard/certificates"
        })),
        ...policies.map((policy) => ({
          type: "policy",
          title: policy.title,
          detail: policy.summary?.slice(0, 120) ?? policy.status.toLowerCase(),
          href: "/dashboard/compliance"
        })),
        ...servicePlans.map((plan) => ({
          type: "service plan",
          title: plan.title,
          detail: `${plan.status.toLowerCase()} - ${plan.startsAt.toLocaleDateString()}`,
          href: "/dashboard/leadership"
        })),
        ...prayerAssignments.map((assignment) => ({
          type: "prayer assignment",
          title: assignment.title,
          detail: `${assignment.category} - ${assignment.status.toLowerCase()}`,
          href: "/dashboard/admin/executive-operations"
        })),
        ...externalGuests.map((guest) => ({
          type: "guest access",
          title: guest.name,
          detail: `${guest.email} - ${guest.status.toLowerCase()} - expires ${guest.expiresAt.toLocaleDateString()}`,
          href: "/dashboard/admin/executive-operations"
        }))
      ].slice(0, 50)
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
