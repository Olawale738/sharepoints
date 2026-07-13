import { logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { ensureCanEditFile } from "@/lib/governance";
import { prisma } from "@/lib/prisma";
import { hasWorkspaceAdminAccess, requireWorkspaceMembership, requireWorkspacePermission } from "@/lib/rbac";
import { fileGovernanceSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const file = await prisma.file.findUnique({
      where: { id }
    });

    if (!file) {
      throw new ApiError(404, "File not found.");
    }

    await requireWorkspaceMembership(user.id, file.workspaceId);
    const parsed = fileGovernanceSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid governance action.");
    }

    if (parsed.data.action === "CHECK_OUT") {
      await ensureCanEditFile(user.id, file);

      if (file.checkedOutById && file.checkedOutById !== user.id) {
        throw new ApiError(409, "This document is already checked out.");
      }

      const updated = await prisma.file.update({
        where: { id },
        data: {
          checkedOutById: user.id,
          checkedOutAt: new Date()
        }
      });
      return ok({ file: updated });
    }

    if (parsed.data.action === "CHECK_IN") {
      if (file.checkedOutById !== user.id && !(await hasWorkspaceAdminAccess(user.id, file.workspaceId))) {
        throw new ApiError(403, "Only the member who checked out this document or an admin can check it in.");
      }

      const updated = await prisma.file.update({
        where: { id },
        data: {
          checkedOutById: null,
          checkedOutAt: null
        }
      });
      return ok({ file: updated });
    }

    if (parsed.data.action === "SET_CLASSIFICATION") {
      await requireWorkspacePermission(user.id, file.workspaceId, "canClassifyDocuments");
      const sensitivityLabel = parsed.data.sensitivityLabel ?? file.sensitivityLabel;
      const updated = await prisma.file.update({
        where: { id },
        data: {
          sensitivityLabel,
          downloadRestricted: parsed.data.downloadRestricted ?? file.downloadRestricted,
          shareRestricted: parsed.data.shareRestricted ?? file.shareRestricted,
          aiRestricted: parsed.data.aiRestricted ?? file.aiRestricted,
          legalHold: sensitivityLabel === "LEGAL_HOLD" ? true : file.legalHold,
          classifiedById: user.id,
          classifiedAt: new Date()
        }
      });

      await logActivity({
        userId: user.id,
        workspaceId: file.workspaceId,
        action: "file.classified",
        targetId: file.id,
        metadata: {
          sensitivityLabel: updated.sensitivityLabel,
          downloadRestricted: updated.downloadRestricted,
          shareRestricted: updated.shareRestricted,
          aiRestricted: updated.aiRestricted
        }
      });

      return ok({ file: updated });
    }

    if (!(await hasWorkspaceAdminAccess(user.id, file.workspaceId))) {
      throw new ApiError(403, "Only admins can manage retention and legal holds.");
    }

    const updated = await prisma.file.update({
      where: { id },
      data:
        parsed.data.action === "SET_LEGAL_HOLD"
          ? { legalHold: parsed.data.legalHold ?? false }
          : { retentionUntil: parsed.data.retentionUntil ? new Date(parsed.data.retentionUntil) : null }
    });

    return ok({ file: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}
