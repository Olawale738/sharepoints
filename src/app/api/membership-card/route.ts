import { handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireUser();
    const [card, profile, memberships] = await Promise.all([
      prisma.digitalMembershipCard.findUnique({ where: { userId: user.id } }),
      prisma.memberProfile.findUnique({ where: { userId: user.id } }),
      prisma.workspaceMember.findMany({
        where: { userId: user.id, workspace: { deletedAt: null } },
        select: {
          role: true,
          workspace: { select: { id: true, name: true, scopeType: true, organizationUnitId: true } }
        },
        orderBy: { joinedAt: "asc" }
      })
    ]);
    const account = await prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true, email: true, image: true }
    });

    return ok({ card, profile, memberships, account });
  } catch (error) {
    return handleRouteError(error);
  }
}
