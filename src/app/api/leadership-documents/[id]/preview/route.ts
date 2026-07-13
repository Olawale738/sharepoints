import { handleRouteError, requireUser } from "@/lib/api";
import { getLeadershipDocumentPreview } from "@/lib/leadership-documents";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export const runtime = "nodejs";

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    return getLeadershipDocumentPreview(user.id, id);
  } catch (error) {
    return handleRouteError(error);
  }
}
