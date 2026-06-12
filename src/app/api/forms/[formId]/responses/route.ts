import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership } from "@/lib/rbac";
import { submitWorkspaceFormSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ formId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { formId } = await context.params;
    const form = await prisma.workspaceForm.findUnique({ where: { id: formId } });

    if (!form) {
      throw new ApiError(404, "Form not found.");
    }

    await requireWorkspaceMembership(user.id, form.workspaceId);

    if (form.status !== "OPEN") {
      throw new ApiError(409, "This form is not accepting responses.");
    }

    const parsed = submitWorkspaceFormSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid response.");
    }

    const response = await prisma.workspaceFormResponse.upsert({
      where: {
        formId_respondentId: {
          formId,
          respondentId: user.id
        }
      },
      update: {
        answers: parsed.data.answers
      },
      create: {
        formId,
        respondentId: user.id,
        answers: parsed.data.answers
      }
    });

    return ok({ response }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
