import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

const ruleSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  pattern: z.string().trim().min(1).max(500),
  action: z.enum(["WARN", "RESTRICT", "BLOCK"]),
  workspaceId: z.string().cuid().optional().nullable()
});

export async function GET() {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id);
    const [rules, incidents] = await Promise.all([
      prisma.dlpRule.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.dlpIncident.findMany({ orderBy: { createdAt: "desc" }, take: 100 })
    ]);
    return ok({ rules, incidents });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id);
    const parsed = ruleSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, "Invalid DLP rule.");
    try {
      new RegExp(parsed.data.pattern);
    } catch {
      throw new ApiError(422, "The DLP pattern is not a valid regular expression.");
    }
    const rule = await prisma.dlpRule.create({
      data: {
        ...parsed.data,
        description: parsed.data.description ?? null,
        workspaceId: parsed.data.workspaceId ?? null,
        createdById: user.id
      }
    });
    return ok({ rule }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id);
    const body = (await request.json()) as { incidentId?: string; status?: "RESOLVED" | "DISMISSED" };
    if (!body.incidentId || !body.status) throw new ApiError(422, "Invalid incident update.");
    const incident = await prisma.dlpIncident.update({
      where: { id: body.incidentId },
      data: { status: body.status, resolvedAt: new Date(), resolvedById: user.id }
    });
    return ok({ incident });
  } catch (error) {
    return handleRouteError(error);
  }
}
