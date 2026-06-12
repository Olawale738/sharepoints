import { ApprovalStatus } from "@prisma/client";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { applyApprovalDecision } from "@/lib/governance";
import { createNotification } from "@/lib/notifications";
import { approvalDecisionSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const body = await request.json();
    const parsed = approvalDecisionSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid approval decision.");
    }

    const approval = await applyApprovalDecision({
      reviewerId: user.id,
      requestId: id,
      status: parsed.data.status === "APPROVED" ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED,
      reason: parsed.data.reason || null
    });

    if (approval) {
      await logActivity({
        userId: user.id,
        workspaceId: approval.workspaceId,
        action: activityActions.approvalReviewed,
        targetId: approval.targetId,
        metadata: {
          targetType: approval.targetType,
          title: approval.title,
          status: approval.status
        }
      });
      await createNotification({
        userId: approval.requesterId,
        workspaceId: approval.workspaceId,
        type: "APPROVAL_DECISION",
        title: `${approval.targetType.toLowerCase()} ${approval.status.toLowerCase()}`,
        body: approval.reason || approval.title,
        href: `/dashboard/workspaces/${approval.workspaceId}`
      });
    }

    return ok({ approval });
  } catch (error) {
    return handleRouteError(error);
  }
}
