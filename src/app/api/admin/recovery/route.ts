import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import {
  getProtectedAdminStatuses,
  isProtectedAdminEmail,
  restoreProtectedAdminAccount,
  superAdminRecoveryConfigured,
  verifySuperAdminRecoveryCode
} from "@/lib/protected-admin";
import { hasAnyWorkspacePermission } from "@/lib/rbac";

const recoverySchema = z.object({
  email: z.string().email().max(254),
  recoveryCode: z.string().trim().min(6).max(256)
});

export async function GET() {
  try {
    const user = await requireUser();

    if (!(await hasAnyWorkspacePermission(user.id, "canRunSuperAdminRecovery"))) {
      throw new ApiError(403, "Only authorized administrators can view protected admin recovery.");
    }

    return ok({
      configured: superAdminRecoveryConfigured(),
      protectedAdmins: await getProtectedAdminStatuses()
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = recoverySchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid recovery request.");
    }

    const email = parsed.data.email.toLowerCase();
    if (!isProtectedAdminEmail(email)) {
      throw new ApiError(403, "This account is not protected for emergency recovery.");
    }

    if (!verifySuperAdminRecoveryCode(parsed.data.recoveryCode)) {
      throw new ApiError(401, "Invalid or unconfigured protected-admin recovery code.");
    }

    const sessionUser = await requireUser().catch(() => null);
    const restored = await restoreProtectedAdminAccount(email, sessionUser?.id);

    return ok({
      user: restored.restoredUser,
      workspace: restored.workspace,
      message: "Protected administrator restored. Use password reset to set a fresh password."
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
