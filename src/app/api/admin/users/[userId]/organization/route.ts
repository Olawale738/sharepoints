import { SecurityEventType } from "@prisma/client";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";
import { logSecurityEvent } from "@/lib/security";
import { updateUserOrganizationSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const admin = await requireUser();

    if (!(await hasAnyWorkspaceAdminRole(admin.id))) {
      throw new ApiError(403, "Only admins can update organization settings.");
    }

    const { userId } = await context.params;
    const body = await request.json();
    const parsed = updateUserOrganizationSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid organization settings.");
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        departmentId: parsed.data.departmentId === undefined ? undefined : parsed.data.departmentId || null,
        category: parsed.data.category === undefined ? undefined : parsed.data.category || null,
        forcePasswordReset: parsed.data.forcePasswordReset,
        singleActiveSession: parsed.data.singleActiveSession,
        sessionVersion: parsed.data.forcePasswordReset
          ? {
              increment: 1
            }
          : undefined
      },
      include: {
        department: true
      }
    });

    if (parsed.data.forcePasswordReset) {
      await logSecurityEvent({
        userId,
        type: SecurityEventType.FORCE_PASSWORD_RESET,
        email: user.email,
        metadata: { adminId: admin.id }
      });
    }

    return ok({ user });
  } catch (error) {
    return handleRouteError(error);
  }
}
