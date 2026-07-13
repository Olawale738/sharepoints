import { handleRouteError, ok, requireUser } from "@/lib/api";
import { deleteLeadershipDocument } from "@/lib/leadership-documents";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const document = await deleteLeadershipDocument(user.id, id);
    return ok({ document });
  } catch (error) {
    return handleRouteError(error);
  }
}
