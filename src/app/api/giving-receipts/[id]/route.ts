import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { revokeGivingReceipt } from "@/lib/leadership-suite";

const schema = z.object({
  status: z.enum(["ACTIVE", "REVOKED", "VOID"])
});

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, "Invalid receipt status.");
    const receipt = await revokeGivingReceipt(user.id, id, parsed.data.status);
    return ok({ receipt });
  } catch (error) {
    return handleRouteError(error);
  }
}
