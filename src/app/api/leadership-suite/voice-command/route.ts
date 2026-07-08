import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { draftLeadershipVoiceCommand } from "@/lib/leadership-suite";

const schema = z.object({
  commandText: z.string().trim().min(3).max(1500)
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Command text is required.");
    const draft = await draftLeadershipVoiceCommand(user.id, parsed.data.commandText);
    return ok({ draft }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
