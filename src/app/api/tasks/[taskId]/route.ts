import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { requireWorkspacePermission } from "@/lib/rbac";
import { updateTaskSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

function parseDueDate(value?: string | null) {
  return value ? new Date(value) : null;
}

async function getTask(taskId: string) {
  const task = await prisma.workspaceTask.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      workspaceId: true
    }
  });

  if (!task) {
    throw new ApiError(404, "Task not found.");
  }

  return task;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { taskId } = await context.params;
    const existingTask = await getTask(taskId);
    await requireWorkspacePermission(user.id, existingTask.workspaceId, "canManageTasks");

    const body = await request.json();
    const parsed = updateTaskSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid task update.");
    }

    if (parsed.data.assignedToId) {
      const assignee = await prisma.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: parsed.data.assignedToId,
            workspaceId: existingTask.workspaceId
          }
        },
        select: { id: true }
      });

      if (!assignee) {
        throw new ApiError(404, "Assignee is not a member of this workspace.");
      }
    }

    const task = await prisma.workspaceTask.update({
      where: { id: taskId },
      data: {
        title: parsed.data.title,
        description: parsed.data.description === undefined ? undefined : parsed.data.description || null,
        status: parsed.data.status,
        dueDate: parsed.data.dueDate === undefined ? undefined : parseDueDate(parsed.data.dueDate),
        assignedToId:
          parsed.data.assignedToId === undefined ? undefined : parsed.data.assignedToId || null
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
      workspaceId: task.workspaceId,
      action: activityActions.taskUpdated,
      targetId: task.id,
      metadata: { title: task.title, status: task.status }
    });

    return ok({ task });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { taskId } = await context.params;
    const task = await prisma.workspaceTask.findUnique({
      where: { id: taskId }
    });

    if (!task) {
      throw new ApiError(404, "Task not found.");
    }

    await requireWorkspacePermission(user.id, task.workspaceId, "canManageTasks");

    await prisma.workspaceTask.delete({
      where: { id: taskId }
    });

    await logActivity({
      userId: user.id,
      workspaceId: task.workspaceId,
      action: activityActions.taskDeleted,
      targetId: task.id,
      metadata: { title: task.title }
    });

    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
