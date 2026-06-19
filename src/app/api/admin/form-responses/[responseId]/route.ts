import { z } from "zod";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

const answerValueSchema = z.union([
  z.string().max(5_000),
  z.number(),
  z.boolean(),
  z.array(z.string().max(500)).max(100)
]);

const updateSchema = z.object({
  answers: z.record(answerValueSchema),
  signatureName: z.string().trim().max(120).nullable().optional(),
  paymentReference: z.string().trim().max(160).nullable().optional()
});

type RouteContext = { params: Promise<{ responseId: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const actor = await requireUser();
    await requireAnyWorkspaceAdmin(actor.id, "Only administrators can edit submitted forms.");
    const { responseId } = await context.params;
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid form response.");
    const existing = await prisma.workspaceFormResponse.findUnique({
      where: { id: responseId },
      include: { form: { select: { workspaceId: true, title: true } } }
    });
    if (!existing) throw new ApiError(404, "Submitted form not found.");

    const response = await prisma.workspaceFormResponse.update({
      where: { id: responseId },
      data: {
        answers: parsed.data.answers,
        signatureName: parsed.data.signatureName,
        paymentReference: parsed.data.paymentReference,
        reviewedById: actor.id,
        reviewedAt: new Date()
      }
    });
    await logActivity({
      userId: actor.id,
      workspaceId: existing.form.workspaceId,
      action: activityActions.workspaceFormResponseEdited,
      targetId: existing.id,
      metadata: { formId: existing.formId, respondentId: existing.respondentId }
    });
    return ok({ response });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const actor = await requireUser();
    await requireAnyWorkspaceAdmin(actor.id, "Only administrators can delete submitted forms.");
    const { responseId } = await context.params;
    const existing = await prisma.workspaceFormResponse.findUnique({
      where: { id: responseId },
      include: { form: { select: { workspaceId: true, title: true } } }
    });
    if (!existing) throw new ApiError(404, "Submitted form not found.");

    await prisma.$transaction(async (tx) => {
      await tx.approvalRequest.deleteMany({ where: { targetType: "FORM_RESPONSE", targetId: existing.id } });
      await tx.workspaceFormResponse.delete({ where: { id: existing.id } });
      await tx.securityEvent.create({
        data: {
          userId: actor.id,
          email: actor.email,
          type: "WORKSPACE_FORM_RESPONSE_DELETED",
          metadata: {
            operation: "WORKSPACE_FORM_RESPONSE_DELETED",
            responseId: existing.id,
            formId: existing.formId,
            respondentId: existing.respondentId
          }
        }
      });
    });
    await logActivity({
      userId: actor.id,
      workspaceId: existing.form.workspaceId,
      action: activityActions.workspaceFormResponseDeleted,
      targetId: existing.id,
      metadata: { formId: existing.formId, respondentId: existing.respondentId }
    });
    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
