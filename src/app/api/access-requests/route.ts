import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import {
  createAccessRequest,
  getAccessRequestsForReview,
  getAccessRequestsForUser,
  getReviewableAccessWorkspaceIds
} from "@/lib/access-requests";
import { createAccessRequestSchema } from "@/lib/validators";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const url = new URL(request.url);
    const scope = url.searchParams.get("scope") ?? "mine";

    if (scope === "review") {
      return ok({
        requests: await getAccessRequestsForReview(user.id),
        canReview: (await getReviewableAccessWorkspaceIds(user.id)).length > 0
      });
    }

    return ok({ requests: await getAccessRequestsForUser(user.id) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = createAccessRequestSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid access request.");
    }

    const result = await createAccessRequest(user.id, parsed.data);
    return ok(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    return handleRouteError(error);
  }
}
