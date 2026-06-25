import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";
import { rotateMembershipCredentialSigningKey } from "@/lib/verifiable-credentials";

export async function GET() {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id);
    const keys = await prisma.credentialSigningKey.findMany({
      select: {
        id: true,
        kid: true,
        algorithm: true,
        active: true,
        createdAt: true,
        retiredAt: true
      },
      orderBy: { createdAt: "desc" }
    });
    return ok({ keys });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id);
    const body = (await request.json().catch(() => null)) as { confirmation?: string } | null;
    if (body?.confirmation !== "ROTATE LETW SIGNING KEY") {
      throw new ApiError(422, "Enter the required signing-key rotation confirmation phrase.");
    }
    const key = await rotateMembershipCredentialSigningKey();
    await logActivity({
      userId: user.id,
      action: activityActions.credentialSigningKeyRotated,
      targetId: key.id,
      metadata: { kid: key.kid, algorithm: key.algorithm }
    });
    return ok({ key }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
