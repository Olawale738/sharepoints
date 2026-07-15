import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import {
  collectPlatformExcellenceSnapshot,
  createForcedPlatformBackup,
  releaseStaleDocumentCheckouts,
  runPlatformMonitorAndNotify,
  verifyRecentBackups
} from "@/lib/platform-excellence";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

const actionSchema = z.object({
  action: z.enum(["RUN_MONITOR", "CREATE_BACKUP", "VERIFY_BACKUPS", "RELEASE_STALE_CHECKOUTS"])
});

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id);

    return ok(await collectPlatformExcellenceSnapshot());
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id);

    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(422, "Choose a valid platform excellence action.");
    }

    if (parsed.data.action === "RUN_MONITOR") {
      return ok({ action: parsed.data.action, result: await runPlatformMonitorAndNotify() });
    }

    if (parsed.data.action === "CREATE_BACKUP") {
      return ok({ action: parsed.data.action, result: await createForcedPlatformBackup() });
    }

    if (parsed.data.action === "VERIFY_BACKUPS") {
      return ok({ action: parsed.data.action, result: await verifyRecentBackups() });
    }

    return ok({ action: parsed.data.action, result: await releaseStaleDocumentCheckouts(user.id) });
  } catch (error) {
    return handleRouteError(error);
  }
}
