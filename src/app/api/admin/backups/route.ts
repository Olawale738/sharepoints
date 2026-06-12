import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { createWorkspaceBackup } from "@/lib/backups";
import { prisma } from "@/lib/prisma";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";
import { getDownloadResponse } from "@/lib/storage";

const backupSchema = z.object({
  workspaceId: z.string().cuid().optional().nullable(),
  name: z.string().trim().min(2).max(120)
});

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id);
    const downloadId = new URL(request.url).searchParams.get("download");
    if (downloadId) {
      const backup = await prisma.backupSnapshot.findUnique({ where: { id: downloadId } });
      if (!backup?.storageKey) throw new ApiError(404, "Backup not found.");
      return getDownloadResponse(backup.storageKey, `${backup.name}.json`, "application/json");
    }
    const backups = await prisma.backupSnapshot.findMany({
      orderBy: { createdAt: "desc" },
      take: 100
    });
    return ok({ backups });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id);
    const parsed = backupSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, "Invalid backup request.");
    const backup = await createWorkspaceBackup(parsed.data.workspaceId ?? null, user.id, parsed.data.name);
    return ok({ backup }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
