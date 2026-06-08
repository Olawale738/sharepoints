import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership } from "@/lib/rbac";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspaceMembership(user.id, id);

    const workspace = await prisma.workspace.findUnique({
      where: { id },
      select: { id: true }
    });

    if (!workspace) {
      throw new ApiError(404, "Workspace not found.");
    }

    const members = await prisma.workspaceMember.findMany({
      where: { workspaceId: id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        }
      },
      orderBy: [
        {
          role: "asc"
        },
        {
          joinedAt: "asc"
        }
      ]
    });

    return ok({ members });
  } catch (error) {
    return handleRouteError(error);
  }
}

