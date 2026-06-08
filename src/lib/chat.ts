import { prisma } from "@/lib/prisma";

export async function getOrCreateGeneralChannel(workspaceId: string, createdById: string) {
  const existing = await prisma.chatChannel.findFirst({
    where: { workspaceId },
    orderBy: { createdAt: "asc" }
  });

  if (existing) {
    return existing;
  }

  return prisma.chatChannel.create({
    data: {
      workspaceId,
      createdById,
      name: "General",
      description: "Workspace-wide conversation."
    }
  });
}

