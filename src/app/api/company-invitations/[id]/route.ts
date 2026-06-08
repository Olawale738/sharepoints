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
        id: true
      }
    });

    if (!existing) {
      throw new ApiError(404, "Access invitation not found.");
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
