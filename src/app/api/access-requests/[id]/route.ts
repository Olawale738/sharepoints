import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { reviewAccessRequest } from "@/lib/access-requests";
import { reviewAccessRequestSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const parsed = reviewAccessRequestSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid access review.");
    }

    const reviewed = await reviewAccessRequest({
      actorId: user.id,
      requestId: id,
      action: parsed.data.action,
      decisionReason: parsed.data.decisionReason,
      expiresInDays: parsed.data.expiresInDays
    });

    return ok({ request: reviewed });
  } catch (error) {
    return handleRouteError(error);
  }
}
