import { SecurityEventType } from "@prisma/client";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { logSecurityEvent } from "@/lib/security";
import {
  requireCanManageUser,
  restoreCompanyInvitationForUser,
  revokeCompanyInvitationForUser,
  revokeUserSessions,
  userAccessStatus
} from "@/lib/user-access";
import { updateUserAccessSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ userId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const actor = await requireUser();
    const { userId } = await context.params;

    const body = await request.json();
    const parsed = updateUserAccessSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid user action.");
    }

    await requireCanManageUser(actor.id, userId, parsed.data.action);

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        deletedAt: true
      }
    });

    if (!target) {
      throw new ApiError(404, "User not found.");
    }

    const now = new Date();
    let action: string = activityActions.userRestored;
    let data = {};

    if (parsed.data.action === "SUSPEND") {
      data = {
        suspendedAt: now
      };
      action = activityActions.userSuspended;
      await revokeUserSessions(userId);
    }

    if (parsed.data.action === "REVOKE") {
      data = {
        accessRevokedAt: now,
        suspendedAt: null
      };
      action = activityActions.userAccessRevoked;
      await revokeUserSessions(userId);
      await revokeCompanyInvitationForUser(userId);
    }

    if (parsed.data.action === "DELETE") {
      data = {
        deletedAt: now,
        accessRevokedAt: now,
        suspendedAt: null,
        image: null,
        passwordHash: null
      };
      action = activityActions.userDeleted;
      await revokeUserSessions(userId);
      await revokeCompanyInvitationForUser(userId);
      await prisma.workspaceMember.deleteMany({
        where: { userId }
      });
    }

    if (parsed.data.action === "RESTORE") {
      if (target.deletedAt) {
        throw new ApiError(409, "Deleted users cannot be restored from the dashboard.");
      }

      data = {
        suspendedAt: null,
        accessRevokedAt: null
      };
      action = activityActions.userRestored;
      await restoreCompanyInvitationForUser(userId, actor.id);
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data,
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
      }
    });

    await logActivity({
      userId: actor.id,
      action,
      targetId: user.id,
      metadata: {
        email: user.email,
        action: parsed.data.action
      }
    });

    const securityType =
      parsed.data.action === "SUSPEND"
        ? SecurityEventType.USER_SUSPENDED
        : parsed.data.action === "REVOKE"
          ? SecurityEventType.ACCESS_REVOKED
          : parsed.data.action === "DELETE"
            ? SecurityEventType.USER_DELETED
            : parsed.data.action === "RESTORE"
              ? SecurityEventType.USER_RESTORED
              : null;

    if (securityType) {
      await logSecurityEvent({
        userId: user.id,
        type: securityType,
        email: user.email,
        metadata: {
          adminId: actor.id,
          action: parsed.data.action
        }
      });
    }

    const { workspaceMemberships, ...userItem } = user;

    return ok({
      user: {
        ...userItem,
        isAdmin: workspaceMemberships.some((membership) => membership.role === "ADMIN"),
        status: userAccessStatus(user)
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
