import { ChurchEventType, ServicePlanStatus } from "@prisma/client";
import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { createServicePlan, getLeadershipSuiteData, updateServicePlan } from "@/lib/leadership-suite";

const listInput = z.union([z.array(z.string()), z.string()]).optional().transform((value) => {
  if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") return value.split("\n").flatMap((line) => line.split(",")).map((item) => item.trim()).filter(Boolean);
  return [];
});

const createSchema = z.object({
  title: z.string().trim().min(2).max(180),
  serviceType: z.nativeEnum(ChurchEventType).default(ChurchEventType.SERVICE),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime().nullable().optional(),
  workspaceId: z.string().cuid().nullable().optional(),
  organizationUnitId: z.string().cuid().nullable().optional(),
  eventId: z.string().cuid().nullable().optional(),
  theme: z.string().trim().max(180).nullable().optional(),
  preacher: z.string().trim().max(160).nullable().optional(),
  coordinatorId: z.string().cuid().nullable().optional(),
  orderOfService: listInput,
  ministers: listInput,
  choirSongs: listInput,
  mediaTeam: listInput,
  prayerPoints: z.string().trim().max(5000).nullable().optional()
});

const updateSchema = z.object({
  id: z.string().cuid(),
  status: z.nativeEnum(ServicePlanStatus).optional(),
  attendanceTotal: z.coerce.number().int().min(0).nullable().optional(),
  newVisitors: z.coerce.number().int().min(0).nullable().optional(),
  salvationDecisions: z.coerce.number().int().min(0).nullable().optional(),
  testimoniesCount: z.coerce.number().int().min(0).nullable().optional(),
  offeringSummary: z.string().trim().max(5000).nullable().optional(),
  postServiceReport: z.string().trim().max(15000).nullable().optional()
});

export async function GET() {
  try {
    const user = await requireUser();
    const data = await getLeadershipSuiteData(user.id);
    return ok({ servicePlans: data.servicePlans });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid service plan.");
    }
    const plan = await createServicePlan(user.id, parsed.data);
    return ok({ plan }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid service report.");
    }
    const { id, ...data } = parsed.data;
    const plan = await updateServicePlan(user.id, id, data);
    return ok({ plan });
  } catch (error) {
    return handleRouteError(error);
  }
}
