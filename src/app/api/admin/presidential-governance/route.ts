import { PresidentialGovernanceControlStatus, PresidentialGovernanceControlType } from "@prisma/client";
import { z } from "zod";

import { handleRouteError, ok, requireUser } from "@/lib/api";
import {
  activateBaselineGovernanceControls,
  clearPresidentialGovernanceLogs,
  createPresidentialGovernanceRecord,
  deletePresidentialGovernanceRecord,
  getPresidentialGovernanceCenter,
  updatePresidentialGovernanceRecord
} from "@/lib/presidential-governance";

export const runtime = "nodejs";

const createSchema = z.object({
  action: z.literal("CREATE_RECORD"),
  controlType: z.nativeEnum(PresidentialGovernanceControlType),
  title: z.string().trim().min(2).max(220),
  summary: z.string().trim().min(2).max(4000),
  status: z.nativeEnum(PresidentialGovernanceControlStatus).default("ACTIVE"),
  severity: z.string().trim().min(2).max(40).default("NORMAL"),
  workspaceId: z.string().cuid().nullable().optional(),
  organizationUnitId: z.string().cuid().nullable().optional(),
  subjectUserId: z.string().cuid().nullable().optional(),
  ownerUserId: z.string().cuid().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional()
});

const baselineSchema = z.object({
  action: z.literal("ACTIVATE_BASELINE_CONTROLS")
});

const clearLogsSchema = z.object({
  action: z.literal("CLEAR_GOVERNANCE_LOGS"),
  confirmation: z.literal("CLEAR GOVERNANCE LOGS")
});

const postSchema = z.discriminatedUnion("action", [createSchema, baselineSchema, clearLogsSchema]);

const patchSchema = z.object({
  id: z.string().cuid(),
  controlType: z.nativeEnum(PresidentialGovernanceControlType).optional(),
  title: z.string().trim().min(2).max(220).optional(),
  summary: z.string().trim().min(2).max(4000).optional(),
  status: z.nativeEnum(PresidentialGovernanceControlStatus).optional(),
  severity: z.string().trim().min(2).max(40).optional(),
  workspaceId: z.string().cuid().nullable().optional(),
  organizationUnitId: z.string().cuid().nullable().optional(),
  subjectUserId: z.string().cuid().nullable().optional(),
  ownerUserId: z.string().cuid().nullable().optional(),
  dueAt: z.string().datetime().nullable().optional()
});

const deleteSchema = z.object({
  id: z.string().cuid()
});

export async function GET() {
  try {
    const user = await requireUser();
    return ok(await getPresidentialGovernanceCenter(user.id));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const data = postSchema.parse(await request.json());

    if (data.action === "ACTIVATE_BASELINE_CONTROLS") {
      return ok({ result: await activateBaselineGovernanceControls(user.id) }, { status: 201 });
    }

    if (data.action === "CLEAR_GOVERNANCE_LOGS") {
      return ok({ result: await clearPresidentialGovernanceLogs(user.id) });
    }

    const record = await createPresidentialGovernanceRecord(user.id, {
      ...data,
      dueAt: data.dueAt ? new Date(data.dueAt) : null
    });
    return ok({ record }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const data = patchSchema.parse(await request.json());
    const record = await updatePresidentialGovernanceRecord(user.id, data.id, {
      ...data,
      dueAt: data.dueAt ? new Date(data.dueAt) : data.dueAt === null ? null : undefined
    });
    return ok({ record });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const data = deleteSchema.parse(await request.json());
    const record = await deletePresidentialGovernanceRecord(user.id, data.id);
    return ok({ record });
  } catch (error) {
    return handleRouteError(error);
  }
}
