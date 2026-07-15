import { ReadRequirementTargetType } from "@prisma/client";
import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import {
  createReadRequirement,
  deactivateReadRequirement,
  listReadConfirmationCenter
} from "@/lib/read-confirmations";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

const createSchema = z.object({
  targetType: z.nativeEnum(ReadRequirementTargetType),
  targetId: z.string().cuid(),
  audienceMode: z.enum(["TARGET_WORKSPACE", "ORGANIZATION", "SELECTED", "POLICY_ASSIGNMENTS"]).default("TARGET_WORKSPACE"),
  userIds: z.array(z.string().cuid()).optional(),
  dueAt: z.string().datetime().nullable().optional(),
  instructions: z.string().trim().max(3000).nullable().optional()
});

const patchSchema = z.object({
  action: z.literal("DEACTIVATE"),
  id: z.string().cuid()
});

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id, "Only administrators can manage read confirmations.");
    return ok(await listReadConfirmationCenter());
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id, "Only administrators can require read confirmations.");
    const parsed = createSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid read confirmation request.");

    return ok({
      requirement: await createReadRequirement(user.id, {
        ...parsed.data,
        dueAt: parsed.data.dueAt ? new Date(parsed.data.dueAt) : null
      })
    }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id, "Only administrators can update read confirmations.");
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new ApiError(422, "Invalid read confirmation update.");
    return ok({ requirement: await deactivateReadRequirement(user.id, parsed.data.id) });
  } catch (error) {
    return handleRouteError(error);
  }
}
