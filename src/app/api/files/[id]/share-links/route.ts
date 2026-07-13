import { randomBytes } from "node:crypto";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { ensureCanShareFile, isPresidentDocumentAuthority } from "@/lib/governance";
import { prisma } from "@/lib/prisma";
import { requireWorkspacePermission } from "@/lib/rbac";
import { createFileShareLinkSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function getShareUrl(request: Request, token: string) {
  return `${new URL(request.url).origin}/api/share/${token}/view`;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const file = await prisma.file.findUnique({
      where: { id },
      select: {
        id: true,
        workspaceId: true,
        uploadedById: true,
        approvalStatus: true,
        fileName: true,
        deletedAt: true,
        dlpRestricted: true,
        sensitivityLabel: true,
        shareRestricted: true
      }
    });

    if (!file || file.deletedAt) {
      throw new ApiError(404, "File not found.");
    }
    if (file.dlpRestricted) {
      throw new ApiError(403, "Share links are disabled for documents restricted by data-loss prevention.");
    }

    await requireWorkspacePermission(user.id, file.workspaceId, "canCreateShareLinks");
    if (!(await isPresidentDocumentAuthority(user.id))) {
      throw new ApiError(403, "Only the president can create protected document links.");
    }
    await ensureCanShareFile(user.id, file);

    const body = await request.json().catch(() => ({}));
    const parsed = createFileShareLinkSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid share link request.");
    }

    const expiresAt = parsed.data.expiresInDays
      ? new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const shareLink = await prisma.fileShareLink.create({
      data: {
        fileId: file.id,
        createdById: user.id,
        token: randomBytes(24).toString("hex"),
        expiresAt
      }
    });

    await logActivity({
      userId: user.id,
      workspaceId: file.workspaceId,
      action: activityActions.fileShareLinkCreated,
      targetId: shareLink.id,
      metadata: { fileName: file.fileName, expiresAt: expiresAt?.toISOString() }
    });

    return ok(
      {
        shareLink: {
          id: shareLink.id,
          url: getShareUrl(request, shareLink.token),
          expiresAt: shareLink.expiresAt
        }
      },
      { status: 201 }
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
