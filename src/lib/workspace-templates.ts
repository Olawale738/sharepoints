import { WorkspaceRole } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export const builtInWorkspaceTemplates = [
  {
    name: "Department",
    category: "DEPARTMENT",
    description: "Files, announcements, planning, and department chat.",
    definition: {
      channels: ["General", "Announcements", "Planning"],
      folders: ["Policies", "Reports", "Shared resources"]
    }
  },
  {
    name: "Ministry",
    category: "MINISTRY",
    description: "Ministry coordination, volunteers, events, and resources.",
    definition: {
      channels: ["General", "Volunteers", "Events"],
      folders: ["Service plans", "Training", "Media"]
    }
  },
  {
    name: "Committee",
    category: "COMMITTEE",
    description: "Private committee documents, decisions, and actions.",
    definition: {
      channels: ["General", "Decisions"],
      folders: ["Agendas", "Minutes", "Approved documents"]
    }
  },
  {
    name: "Event",
    category: "EVENT",
    description: "Run an event from planning through follow-up.",
    definition: {
      channels: ["General", "Logistics", "Volunteers"],
      folders: ["Planning", "Publicity", "Post-event"]
    }
  }
] as const;

export async function ensureBuiltInWorkspaceTemplates() {
  for (const template of builtInWorkspaceTemplates) {
    await prisma.workspaceTemplate.upsert({
      where: { name_category: { name: template.name, category: template.category } },
      update: {
        description: template.description,
        definition: template.definition,
        system: true,
        enabled: true
      },
      create: {
        ...template,
        system: true
      }
    });
  }
}

export async function applyWorkspaceTemplate(workspaceId: string, templateId: string, createdById: string) {
  const template = await prisma.workspaceTemplate.findFirst({
    where: { id: templateId, enabled: true }
  });
  if (!template) return;
  const definition = template.definition as { channels?: string[]; folders?: string[] };

  await prisma.$transaction([
    prisma.workspace.update({ where: { id: workspaceId }, data: { templateId: template.id } }),
    ...Array.from(new Set(definition.channels ?? [])).map((name) =>
      prisma.chatChannel.upsert({
        where: { workspaceId_name: { workspaceId, name } },
        update: {},
        create: { workspaceId, name, createdById }
      })
    ),
    ...Array.from(new Set(definition.folders ?? [])).map((name) =>
      prisma.folder.create({
        data: { workspaceId, name, createdById }
      })
    ),
    prisma.workspaceRolePermission.upsert({
      where: { workspaceId_role: { workspaceId, role: WorkspaceRole.LEADER } },
      update: {},
      create: {
        workspaceId,
        role: WorkspaceRole.LEADER,
        canUploadFiles: true,
        canDeleteFiles: true,
        canCreateFolders: true,
        canCreateChannels: true,
        canViewActivity: true,
        canCreateAnnouncements: true,
        canManageTasks: true,
        canCreateShareLinks: true
      }
    })
  ]);
}
