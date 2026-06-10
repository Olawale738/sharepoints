import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership } from "@/lib/rbac";
import { createTaskCommentSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { taskId } = await context.params;
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

    await requireWorkspaceMembership(user.id, task.workspaceId);

    const body = await request.json();
    const parsed = createTaskCommentSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid task comment.");
    }

    const comment = await prisma.workspaceTaskComment.create({
      data: {
        taskId,
        authorId: user.id,
        body: parsed.data.body
      },
      include: {
        author: {
          select: {
            name: true,
            email: true
          }
        }
      }
    });

    return ok({ comment }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
