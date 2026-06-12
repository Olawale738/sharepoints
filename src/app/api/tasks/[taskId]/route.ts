import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { notifyUsers } from "@/lib/notifications";
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

    const assigneeIds = parsed.data.assigneeIds
      ? Array.from(new Set([...(parsed.data.assigneeIds ?? []), parsed.data.assignedToId || ""].filter(Boolean)))
      : undefined;

    if (assigneeIds?.length) {
      const assigneeCount = await prisma.workspaceMember.count({
        where: {
          workspaceId: existingTask.workspaceId,
          userId: {
            in: assigneeIds
          }
        }
      });

      if (assigneeCount !== assigneeIds.length) {
        throw new ApiError(404, "One or more assignees are not members of this workspace.");
      }
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
        priority: parsed.data.priority,
        dueDate: parsed.data.dueDate === undefined ? undefined : parseDueDate(parsed.data.dueDate),
        reminderAt: parsed.data.reminderAt === undefined ? undefined : parseDueDate(parsed.data.reminderAt),
        assignedToId:
          parsed.data.assignedToId === undefined ? undefined : parsed.data.assignedToId || assigneeIds?.[0] || null,
        assignees: assigneeIds
          ? {
              deleteMany: {},
              create: assigneeIds.map((assigneeId) => ({
                userId: assigneeId
              }))
            }
          : undefined
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
        },
        assignees: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        },
        comments: {
          include: {
            author: {
              select: {
                name: true,
                email: true
              }
            }
          },
          orderBy: { createdAt: "desc" },
          take: 5
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
    const taskAssigneeIds = Array.from(
      new Set([task.assignedTo?.id, ...task.assignees.map((assignee) => assignee.userId)].filter(Boolean) as string[])
    ).filter((assigneeId) => assigneeId !== user.id);
    await notifyUsers(taskAssigneeIds, {
      workspaceId: task.workspaceId,
      type: "TASK_UPDATED",
      title: "An assigned task was updated",
      body: `${task.title} is now ${task.status.toLowerCase().replaceAll("_", " ")}.`,
      href: `/dashboard/workspaces/${task.workspaceId}`
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
