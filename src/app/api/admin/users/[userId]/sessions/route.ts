import { SecurityEventType } from "@prisma/client";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";
import { logSecurityEvent } from "@/lib/security";

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const admin = await requireUser();

    if (!(await hasAnyWorkspaceAdminRole(admin.id))) {
      throw new ApiError(403, "Only admins can revoke sessions.");
    }

    const { userId } = await context.params;
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        sessionVersion: {
          increment: 1
        },
        sessions: {
          deleteMany: {}
        }
      },
      select: {
        id: true,
        email: true
      }
    });

    await logSecurityEvent({
      userId,
      type: SecurityEventType.SESSION_REVOKED,
      email: user.email,
      metadata: { adminId: admin.id }
    });

    return ok({ revoked: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
