import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { confirmReadRequirement, listOutstandingReadConfirmations } from "@/lib/read-confirmations";

const confirmSchema = z.object({
  requirementId: z.string().cuid(),
  signatureName: z.string().trim().min(2).max(160)
});

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    return ok({ outstanding: await listOutstandingReadConfirmations(user.id) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = confirmSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ApiError(422, "Type your full name to confirm you have read this record.");

    return ok({
      receipt: await confirmReadRequirement(user.id, {
        requirementId: parsed.data.requirementId,
        signatureName: parsed.data.signatureName,
        ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
        userAgent: request.headers.get("user-agent")
      })
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
