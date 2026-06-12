import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { canApproveWorkspaceContent, createApprovalRequestIfNeeded, initialApprovalStatus } from "@/lib/governance";
import { notifyUsers } from "@/lib/notifications";
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
    const canApprove = await canApproveWorkspaceContent(user.id, id);

    const tasks = await prisma.workspaceTask.findMany({
      where: canApprove
        ? { workspaceId: id }
        : {
            workspaceId: id,
            OR: [
              { approvalStatus: "APPROVED" },
              { createdById: user.id },
              { assignedToId: user.id },
              { assignees: { some: { userId: user.id } } }
            ]
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

    const assigneeIds = Array.from(new Set([...(parsed.data.assigneeIds ?? []), parsed.data.assignedToId || ""].filter(Boolean)));

    if (assigneeIds.length) {
      const assigneeCount = await prisma.workspaceMember.count({
        where: {
          workspaceId: id,
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
            workspaceId: id
          }
        },
        select: { id: true }
      });

      if (!assignee) {
        throw new ApiError(404, "Assignee is not a member of this workspace.");
      }
    }

    const approvalStatus = await initialApprovalStatus(user.id, id);
    const task = await prisma.workspaceTask.create({
      data: {
        workspaceId: id,
        createdById: user.id,
        title: parsed.data.title,
        description: parsed.data.description || null,
        status: parsed.data.status ?? "TODO",
        priority: parsed.data.priority ?? "NORMAL",
        dueDate: parseDueDate(parsed.data.dueDate),
        reminderAt: parseDueDate(parsed.data.reminderAt),
        assignedToId: parsed.data.assignedToId || assigneeIds[0] || null,
        approvalStatus,
        approvedById: approvalStatus === "APPROVED" ? user.id : null,
        approvedAt: approvalStatus === "APPROVED" ? new Date() : null,
        assignees: assigneeIds.length
          ? {
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
    await createApprovalRequestIfNeeded({
      status: approvalStatus,
      workspaceId: id,
      requesterId: user.id,
      targetType: "TASK",
      targetId: task.id,
      title: task.title
    });

    await logActivity({
      userId: user.id,
      workspaceId: id,
      action: activityActions.taskCreated,
      targetId: task.id,
      metadata: { title: task.title, status: task.status, priority: task.priority, approvalStatus }
    });
    await notifyUsers(assigneeIds.filter((assigneeId) => assigneeId !== user.id), {
      workspaceId: id,
      type: "TASK_ASSIGNED",
      title: "A task was assigned to you",
      body: task.title,
      href: `/dashboard/workspaces/${id}`
    });

    return ok({ task }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
