import { handleRouteError, ok, requireUser } from "@/lib/api";
import { openConfidentialVaultRecord } from "@/lib/leadership-governance";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const record = await openConfidentialVaultRecord(user.id, id, request);
    return ok({ record });
  } catch (error) {
    return handleRouteError(error);
  }
}
