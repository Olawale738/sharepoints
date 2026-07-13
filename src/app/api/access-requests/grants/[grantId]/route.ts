import { handleRouteError, ok, requireUser } from "@/lib/api";
import { revokeFileAccessGrant } from "@/lib/access-requests";

type RouteContext = {
  params: Promise<{ grantId: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { grantId } = await context.params;
    const grant = await revokeFileAccessGrant({
      actorId: user.id,
      grantId
    });

    return ok({ grant });
  } catch (error) {
    return handleRouteError(error);
  }
}
