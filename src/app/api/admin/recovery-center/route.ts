import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { getRecoveryCenterData, performRecoveryCenterAction } from "@/lib/admin-command-center";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

const actionSchema = z.object({
  id: z.string().cuid(),
  action: z.enum([
    "RESTORE_USER",
    "RESTORE_CERTIFICATE",
    "DELETE_CERTIFICATE",
    "RESTORE_LETTER",
    "DELETE_LETTER",
    "RESTORE_REPORT",
    "DELETE_REPORT"
  ])
});

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id, "Only administrators can open backup recovery.");

    return ok(await getRecoveryCenterData());
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id, "Only administrators can perform recovery actions.");

    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(422, "Choose a valid recovery action.");
    }

    return ok({ action: parsed.data.action, result: await performRecoveryCenterAction(user.id, parsed.data) });
  } catch (error) {
    return handleRouteError(error);
  }
}
