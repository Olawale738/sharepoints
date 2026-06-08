import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership, requireWorkspacePermission } from "@/lib/rbac";
import { createTaskSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parseDueDate(value?: string | null) {
  return value ? new Date(value) : null;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspaceMembership(user.id, id);

    const tasks = await prisma.workspaceTask.findMany({
      where: { workspaceId: id },
      include: {
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        createdBy: {
          select: {
            name: true,
            email: true
          }
        }
      },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      take: 50
    });

    return ok({ tasks });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspacePermission(user.id, id, "canManageTasks");

    const body = await request.json();
    const parsed = createTaskSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid task.");
    }

    if (parsed.data.assignedToId) {
      const assignee = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: parsed.data.assignedToId,
            workspaceId: id
          }
        },
        select: { id: true }
      });

      if (!assignee) {
        throw new ApiError(404, "Assignee is not a member of this workspace.");
      }
    }

    const task = await prisma.workspaceTask.create({
      data: {
        workspaceId: id,
        createdById: user.id,
        title: parsed.data.title,
        description: parsed.data.description || null,
        status: parsed.data.status ?? "TODO",
        dueDate: parseDueDate(parsed.data.dueDate),
        assignedToId: parsed.data.assignedToId || null
      },
      include: {
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        createdBy: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    await logActivity({
      userId: user.id,
      workspaceId: id,
      action: activityActions.taskCreated,
      targetId: task.id,
      metadata: { title: task.title, status: task.status }
    });

    return ok({ task }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
