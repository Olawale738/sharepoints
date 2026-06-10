import { handleRouteError, ok, requireUser } from "@/lib/api";
import { getAdminVisibleWorkspaceIds } from "@/lib/governance";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireUser();
    const workspaceIds = await getAdminVisibleWorkspaceIds(user.id);

    const approvals = workspaceIds.length
      ? await prisma.approvalRequest.findMany({
          where: {
            workspaceId: {
              in: workspaceIds
            }
          },
          include: {
            workspace: {
              select: {
                id: true,
                name: true
              }
            },
            requester: {
              select: {
                name: true,
                email: true
              }
            },
            reviewer: {
              select: {
                name: true,
                email: true
              }
            }
          },
          orderBy: [{ status: "asc" }, { createdAt: "desc" }],
          take: 100
        })
      : [];

    return ok({ approvals });
  } catch (error) {
    return handleRouteError(error);
  }
}
