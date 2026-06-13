import { z } from "zod";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

const nullableText = (max: number) => z.string().trim().max(max).nullable().optional();
const profileSchema = z.object({
  phone: nullableText(40),
  alternatePhone: nullableText(40),
  membershipNumber: nullableText(80),
  membershipStatus: z.string().trim().min(2).max(40),
  dateOfBirth: z.string().date().nullable().optional(),
  gender: nullableText(40),
  maritalStatus: nullableText(40),
  address: nullableText(500),
  city: nullableText(120),
  country: nullableText(120),
  occupation: nullableText(160),
  employer: nullableText(160),
  emergencyContactName: nullableText(160),
  emergencyContactPhone: nullableText(40),
  firstVisitAt: z.string().date().nullable().optional(),
  salvationAt: z.string().date().nullable().optional(),
  baptismAt: z.string().date().nullable().optional(),
  membershipStartedAt: z.string().date().nullable().optional(),
  communicationPreference: nullableText(80),
  ministryInterests: z.array(z.string().trim().min(1).max(120)).max(30),
  skills: z.array(z.string().trim().min(1).max(120)).max(30),
  pastoralCareStatus: nullableText(80),
  adminNotes: nullableText(10_000)
});

function dateOrNull(value?: string | null) {
  return value ? new Date(`${value}T00:00:00.000Z`) : null;
}

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }) {
  try {
    const actor = await requireUser();
    await requireAnyWorkspaceAdmin(actor.id, "Only administrators can update member CRM profiles.");
    const { userId } = await context.params;
    const parsed = profileSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid member profile.");
    }

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true }
    });
    if (!target) throw new ApiError(404, "Member not found.");
    const { dateOfBirth, firstVisitAt, salvationAt, baptismAt, membershipStartedAt, ...data } = parsed.data;
    const profile = await prisma.memberProfile.upsert({
      where: { userId },
      update: {
        ...data,
        dateOfBirth: dateOrNull(dateOfBirth),
        firstVisitAt: dateOrNull(firstVisitAt),
        salvationAt: dateOrNull(salvationAt),
        baptismAt: dateOrNull(baptismAt),
        membershipStartedAt: dateOrNull(membershipStartedAt)
      },
      create: {
        userId,
        ...data,
        dateOfBirth: dateOrNull(dateOfBirth),
        firstVisitAt: dateOrNull(firstVisitAt),
        salvationAt: dateOrNull(salvationAt),
        baptismAt: dateOrNull(baptismAt),
        membershipStartedAt: dateOrNull(membershipStartedAt)
      }
    });

    await logActivity({
      userId: actor.id,
      action: activityActions.memberProfileUpdated,
      targetId: userId,
      metadata: { email: target.email }
    });

    return ok({ profile });
  } catch (error) {
    return handleRouteError(error);
  }
}
