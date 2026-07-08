import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { generateLeadershipReport } from "@/lib/leadership-suite";

const schema = z.object({
  prompt: z.string().trim().min(3).max(1000)
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Prompt is required.");
    return ok(await generateLeadershipReport(user.id, parsed.data.prompt));
  } catch (error) {
    return handleRouteError(error);
  }
}
