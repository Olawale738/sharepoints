import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceAdminAccess } from "@/lib/rbac";

type RouteContext = { params: Promise<{ id: string }> };

const workflowSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  trigger: z.enum(["FILE_UPLOADED", "FILE_APPROVED", "TASK_CREATED", "MEETING_ENDED", "FORM_SUBMITTED", "SCHEDULED"]),
  actions: z.array(
    z.discriminatedUnion("type", [
      z.object({ type: z.literal("REQUEST_APPROVAL") }),
      z.object({
        type: z.literal("NOTIFY_ROLE"),
        roles: z.array(z.enum(["ADMIN", "LEADER", "MODERATOR", "USER", "EDITOR", "VIEWER"])).min(1),
        title: z.string().trim().max(160).optional()
      }),
      z.object({ type: z.literal("ARCHIVE_FILE") }),
      z.object({
        type: z.literal("CREATE_TASK"),
        title: z.string().trim().max(160).optional(),
        assigneeId: z.string().cuid().optional()
      })
    ])
  ).min(1).max(10)
});

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspaceAdminAccess(user.id, id);
    const workflows = await prisma.workflowDefinition.findMany({
      where: { workspaceId: id },
      orderBy: { createdAt: "desc" }
    });
    const runs = await prisma.workflowRun.findMany({
      where: { workspaceId: id },
      orderBy: { startedAt: "desc" },
      take: 30
    });
    return ok({ workflows, runs });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspaceAdminAccess(user.id, id);
    const parsed = workflowSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid workflow.");

    const workflow = await prisma.workflowDefinition.create({
      data: {
        workspaceId: id,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        trigger: parsed.data.trigger,
        actions: parsed.data.actions,
        createdById: user.id
      }
    });
    return ok({ workflow }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
