import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership, requireWorkspacePermission } from "@/lib/rbac";
import { createWorkspaceFormSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ formId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { formId } = await context.params;
    const existing = await prisma.workspaceForm.findUnique({ where: { id: formId } });

    if (!existing) {
      throw new ApiError(404, "Form not found.");
    }

    await requireWorkspacePermission(user.id, existing.workspaceId, "canCreateAnnouncements");
    const parsed = createWorkspaceFormSchema.partial().safeParse(await request.json());

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid form.");
    }

    const form = await prisma.workspaceForm.update({
      where: { id: formId },
      data: {
        title: parsed.data.title,
        description: parsed.data.description === undefined ? undefined : parsed.data.description || null,
        status: parsed.data.status,
        fields: parsed.data.fields
      }
    });

    return ok({ form });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { formId } = await context.params;
    const form = await prisma.workspaceForm.findUnique({
      where: { id: formId },
      include: {
        responses: {
          include: {
            respondent: {
              select: { name: true, email: true }
            }
          },
          orderBy: { createdAt: "desc" }
        }
      }
    });

    if (!form) {
      throw new ApiError(404, "Form not found.");
    }

    await requireWorkspaceMembership(user.id, form.workspaceId);
    return ok({ form });
  } catch (error) {
    return handleRouteError(error);
  }
}
