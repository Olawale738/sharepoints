import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceAdminAccess } from "@/lib/rbac";

type RouteContext = { params: Promise<{ workflowId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { workflowId } = await context.params;
    const workflow = await prisma.workflowDefinition.findUnique({ where: { id: workflowId } });
    if (!workflow) throw new ApiError(404, "Workflow not found.");
    await requireWorkspaceAdminAccess(user.id, workflow.workspaceId);
    const body = (await request.json()) as { enabled?: boolean };
    const updated = await prisma.workflowDefinition.update({
      where: { id: workflowId },
      data: { enabled: body.enabled ?? !workflow.enabled }
    });
    return ok({ workflow: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { workflowId } = await context.params;
    const workflow = await prisma.workflowDefinition.findUnique({ where: { id: workflowId } });
    if (!workflow) throw new ApiError(404, "Workflow not found.");
    await requireWorkspaceAdminAccess(user.id, workflow.workspaceId);
    await prisma.workflowDefinition.delete({ where: { id: workflowId } });
    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
