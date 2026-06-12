import { RecycleItemType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export function recycleRestoreUntil() {
  const days = Math.max(1, Number(process.env.RECYCLE_RETENTION_DAYS ?? 30));
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export async function recycleFile(fileId: string, deletedById: string) {
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file) return null;
  const deletedAt = new Date();
  const restoreUntil = recycleRestoreUntil();

  await prisma.$transaction([
    prisma.file.update({
      where: { id: fileId },
      data: { deletedAt, deletedById, restoreUntil }
    }),
    prisma.recycleBinItem.create({
      data: {
        workspaceId: file.workspaceId,
        itemType: RecycleItemType.FILE,
        itemId: file.id,
        displayName: file.fileName,
        deletedById,
        deletedAt,
        restoreUntil,
        snapshot: {
          folderId: file.folderId,
          storageKey: file.storageKey,
          size: file.size,
          fileType: file.fileType
        }
      }
    })
  ]);

  return { file, restoreUntil };
}

export async function recycleWorkspace(workspaceId: string, deletedById: string) {
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) return null;
  const deletedAt = new Date();
  const restoreUntil = recycleRestoreUntil();

  await prisma.$transaction([
    prisma.workspace.update({
      where: { id: workspaceId },
      data: { deletedAt, deletedById, restoreUntil }
    }),
    prisma.recycleBinItem.create({
      data: {
        workspaceId,
        itemType: RecycleItemType.WORKSPACE,
        itemId: workspace.id,
        displayName: workspace.name,
        deletedById,
        deletedAt,
        restoreUntil,
        snapshot: {
          slug: workspace.slug,
          description: workspace.description
        }
      }
    })
  ]);

  return { workspace, restoreUntil };
}
