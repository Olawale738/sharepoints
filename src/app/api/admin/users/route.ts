import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";
import { userAccessStatus } from "@/lib/user-access";

export async function GET() {
  try {
    const user = await requireUser();

    if (!(await hasAnyWorkspaceAdminRole(user.id))) {
      throw new ApiError(403, "Only admins can view users.");
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        suspendedAt: true,
        accessRevokedAt: true,
        deletedAt: true,
        workspaceMemberships: {
          select: {
            role: true
          }
        },
        _count: {
          select: {
            workspaceMemberships: true,
            uploadedFiles: true,
            activityLogs: true
          }
        }
      },
      orderBy: [{ deletedAt: "asc" }, { createdAt: "desc" }],
      take: 250
    });

    return ok({
      users: users.map((item) => {
        const { workspaceMemberships, ...userItem } = item;

        return {
          ...userItem,
          isAdmin: workspaceMemberships.some((membership) => membership.role === "ADMIN"),
          status: userAccessStatus(item)
        };
      })
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
