import { z } from "zod";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

const liftSchema = z.object({
  reason: z.string().trim().min(3).max(2_000)
});

export async function PATCH(request: Request, context: { params: Promise<{ sanctionId: string }> }) {
  try {
    const actor = await requireUser();
    await requireAnyWorkspaceAdmin(actor.id, "Only administrators can lift sanctions.");
    const { sanctionId } = await context.params;
    const parsed = liftSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Enter a reason.");
    const sanction = await prisma.memberSanction.findUnique({
      where: { id: sanctionId },
      include: { user: { select: { email: true } } }
    });
    if (!sanction) throw new ApiError(404, "Sanction not found.");
    if (sanction.status === "LIFTED") throw new ApiError(409, "This sanction has already been lifted.");

    const updated = await prisma.$transaction(async (tx) => {
      const next = await tx.memberSanction.update({
        where: { id: sanction.id },
        data: {
          status: "LIFTED",
          liftedAt: new Date(),
          liftedById: actor.id,
          liftReason: parsed.data.reason
        }
      });
      await tx.securityEvent.create({
        data: {
          userId: sanction.userId,
          email: sanction.user.email,
          type: "MEMBER_SANCTION_LIFTED",
          metadata: { sanctionId: sanction.id, liftedById: actor.id }
        }
      });
      return next;
    });
    await notifyUsers([sanction.userId], {
      type: "MEMBER_SANCTION_LIFTED",
      title: "Account restriction lifted",
      body: parsed.data.reason,
      href: "/dashboard/compliance"
    });
    await logActivity({
      userId: actor.id,
      action: activityActions.memberSanctionLifted,
      targetId: sanction.id,
      metadata: { targetUserId: sanction.userId, type: sanction.type }
    });
    return ok({ sanction: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}
