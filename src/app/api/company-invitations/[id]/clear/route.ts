import { WorkspaceRole } from "@prisma/client";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { requireCompanyInvitationAdmin } from "@/lib/company-invitations";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    await requireCompanyInvitationAdmin(user.id);

    const { id } = await context.params;
    const invitation = await prisma.companyEmailInvitation.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        revokedAt: true
      }
    });

    if (!invitation) {
      throw new ApiError(404, "Access invitation log not found.");
    }

    const protectedAdminEmail = (process.env.SEED_ADMIN_EMAIL ?? "president@letw.org").toLowerCase();
    const invitationEmail = invitation.email.toLowerCase();

    if (invitationEmail === protectedAdminEmail) {
      throw new ApiError(409, "The primary admin invitation log cannot be cleared.");
    }

    if (!invitation.revokedAt) {
      throw new ApiError(409, "Only revoked invitation logs can be cleared. Revoke this invitation first.");
    }

    const invitedUser = await prisma.user.findUnique({
      where: {
        email: invitationEmail
      },
      select: {
        workspaceMemberships: {
          select: {
            role: true
          }
        }
      }
    });

    if (invitedUser?.workspaceMemberships.some((membership) => membership.role === WorkspaceRole.ADMIN)) {
      throw new ApiError(409, "Admin invitation logs cannot be cleared.");
    }

    await prisma.companyEmailInvitation.delete({
      where: { id }
    });

    await logActivity({
      userId: user.id,
      action: activityActions.companyInvitationCleared,
      targetId: id,
      metadata: {
        email: invitation.email
      }
    });

    return ok({
      invitation: {
        id: invitation.id,
        email: invitation.email
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
