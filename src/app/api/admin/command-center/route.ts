import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import {
  cleanupExpiredAccess,
  getUnifiedCommandCenterData,
  syncDocumentLifecycleFromFiles
} from "@/lib/admin-command-center";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

const actionSchema = z.object({
  action: z.enum(["SYNC_DOCUMENT_LIFECYCLE", "CLEANUP_EXPIRED_ACCESS"])
});

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id, "Only administrators can open the unified command center.");

    return ok(await getUnifiedCommandCenterData());
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id, "Only administrators can run command center actions.");

    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(422, "Choose a valid command center action.");
    }

    if (parsed.data.action === "SYNC_DOCUMENT_LIFECYCLE") {
      return ok({ action: parsed.data.action, result: await syncDocumentLifecycleFromFiles(user.id) });
    }

    return ok({ action: parsed.data.action, result: await cleanupExpiredAccess(user.id) });
  } catch (error) {
    return handleRouteError(error);
  }
}
