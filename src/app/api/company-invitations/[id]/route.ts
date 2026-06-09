import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { companyInvitationInclude, requireCompanyInvitationAdmin } from "@/lib/company-invitations";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    await requireCompanyInvitationAdmin(user.id);

    const { id } = await context.params;
    const existing = await prisma.companyEmailInvitation.findUnique({
      where: {
        id
      },
      select: {
        id: true,
        email: true
      }
    });

    if (!existing) {
      throw new ApiError(404, "Access invitation not found.");
    }

    const protectedAdminEmail = (process.env.SEED_ADMIN_EMAIL ?? "president@letw.org").toLowerCase();
    const invitationEmail = existing.email.toLowerCase();

    if (invitationEmail === protectedAdminEmail) {
      throw new ApiError(409, "The primary admin invitation cannot be revoked.");
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

    if (invitedUser?.workspaceMemberships.some((membership) => membership.role === "ADMIN")) {
      throw new ApiError(409, "Admin invitations cannot be revoked. Remove admin roles first.");
    }

    const invitation = await prisma.companyEmailInvitation.update({
      where: {
        id
      },
      data: {
        revokedAt: new Date()
      },
      include: companyInvitationInclude
    });

    return ok({ invitation });
  } catch (error) {
    return handleRouteError(error);
  }
}
