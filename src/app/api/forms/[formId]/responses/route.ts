import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership } from "@/lib/rbac";
import { submitWorkspaceFormSchema } from "@/lib/validators";
import { runWorkspaceWorkflows } from "@/lib/workflows";

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

    const fields = form.fields as Array<{
      id: string;
      required?: boolean;
      condition?: { fieldId: string; operator: string; value?: string | boolean };
    }>;
    const isVisible = (field: (typeof fields)[number]) => {
      if (!field.condition) return true;
      const actual = parsed.data.answers[field.condition.fieldId];
      if (field.condition.operator === "CHECKED") return actual === true;
      const actualText = String(actual ?? "");
      const expectedText = String(field.condition.value ?? "");
      if (field.condition.operator === "EQUALS") return actualText === expectedText;
      if (field.condition.operator === "NOT_EQUALS") return actualText !== expectedText;
      return actualText.toLowerCase().includes(expectedText.toLowerCase());
    };
    const missingRequired = fields.find((field) => {
      if (!field.required || !isVisible(field)) return false;
      const value = parsed.data.answers[field.id];
      return value === undefined || value === null || value === "" || value === false;
    });
    if (missingRequired) throw new ApiError(422, "Please complete all required visible questions.");
    if (form.signatureRequired && !parsed.data.signatureName) {
      throw new ApiError(422, "A typed signature is required.");
    }

    const response = await prisma.workspaceFormResponse.upsert({
      where: {
        formId_respondentId: {
          formId,
          respondentId: user.id
        }
      },
      update: {
        answers: parsed.data.answers,
        approvalStatus: form.requiresApproval ? "PENDING" : "APPROVED",
        paymentStatus: form.paymentRequired ? "PENDING" : "NOT_REQUIRED",
        paymentReference: parsed.data.paymentReference || null,
        signatureName: parsed.data.signatureName || null,
        signedAt: parsed.data.signatureName ? new Date() : null
      },
      create: {
        formId,
        respondentId: user.id,
        answers: parsed.data.answers,
        approvalStatus: form.requiresApproval ? "PENDING" : "APPROVED",
        paymentStatus: form.paymentRequired ? "PENDING" : "NOT_REQUIRED",
        paymentReference: parsed.data.paymentReference || null,
        signatureName: parsed.data.signatureName || null,
        signedAt: parsed.data.signatureName ? new Date() : null
      }
    });

    if (form.requiresApproval) {
      await prisma.approvalRequest.upsert({
        where: {
          targetType_targetId: {
            targetType: "FORM_RESPONSE",
            targetId: response.id
          }
        },
        update: {
          status: "PENDING",
          reviewerId: null,
          reviewedAt: null,
          reason: null
        },
        create: {
          workspaceId: form.workspaceId,
          requesterId: user.id,
          targetType: "FORM_RESPONSE",
          targetId: response.id,
          title: `${form.title} response`
        }
      });
    }
    await runWorkspaceWorkflows({
      workspaceId: form.workspaceId,
      trigger: "FORM_SUBMITTED",
      triggerId: response.id,
      actorId: user.id,
      payload: { formId: form.id, formTitle: form.title, responseId: response.id }
    });

    return ok({ response }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
