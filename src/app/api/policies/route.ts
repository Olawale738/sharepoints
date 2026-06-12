import { NotificationPriority, PolicyStatus } from "@prisma/client";
import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { createNotification } from "@/lib/notifications";
import { activeOrganizationUsers, isOperationsManager, requireOperationsManager } from "@/lib/operations";
import { prisma } from "@/lib/prisma";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("CREATE"),
    workspaceId: z.string().cuid().optional().nullable(),
    title: z.string().trim().min(3).max(180),
    summary: z.string().trim().max(1000).optional().nullable(),
    content: z.string().trim().min(10).max(100_000),
    fileId: z.string().cuid().optional().nullable(),
    dueDays: z.number().int().min(1).max(365).optional()
  }),
  z.object({
    action: z.literal("PUBLISH"),
    policyId: z.string().cuid(),
    userIds: z.array(z.string().cuid()).min(1).max(1000)
  }),
  z.object({
    action: z.literal("ACKNOWLEDGE"),
    policyId: z.string().cuid(),
    signatureName: z.string().trim().min(2).max(120)
  }),
  z.object({
    action: z.literal("STATUS"),
    policyId: z.string().cuid(),
    status: z.nativeEnum(PolicyStatus)
  }),
  z.object({
    action: z.literal("REMIND"),
    policyId: z.string().cuid()
  })
]);

export async function GET() {
  try {
    const user = await requireUser();
    const manager = await isOperationsManager(user.id);
    const [policies, assignments, users] = await Promise.all([
      prisma.policyDocument.findMany({
        where: manager
          ? {}
          : {
              status: "PUBLISHED",
              id: {
                in: (
                  await prisma.policyAssignment.findMany({
                    where: { userId: user.id },
                    select: { policyId: true }
                  })
                ).map((assignment) => assignment.policyId)
              }
            },
        orderBy: { updatedAt: "desc" }
      }),
      prisma.policyAssignment.findMany({
        where: manager ? {} : { userId: user.id },
        orderBy: { assignedAt: "desc" },
        take: 2000
      }),
      manager ? activeOrganizationUsers() : Promise.resolve([])
    ]);
    return ok({ policies, assignments, users, canManage: manager });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid policy action.");
    const data = parsed.data;

    if (data.action === "ACKNOWLEDGE") {
      const assignment = await prisma.policyAssignment.findUnique({
        where: { policyId_userId: { policyId: data.policyId, userId: user.id } }
      });
      if (!assignment) throw new ApiError(404, "Policy assignment not found.");
      const acknowledged = await prisma.policyAssignment.update({
        where: { id: assignment.id },
        data: {
          acknowledgedAt: new Date(),
          signatureName: data.signatureName,
          signatureIp: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
        }
      });
      return ok({ assignment: acknowledged });
    }

    await requireOperationsManager(user.id);

    if (data.action === "CREATE") {
      const policy = await prisma.policyDocument.create({
        data: {
          workspaceId: data.workspaceId ?? null,
          title: data.title,
          summary: data.summary || null,
          content: data.content,
          fileId: data.fileId ?? null,
          dueDays: data.dueDays ?? 14,
          reminderDays: [7, 3, 1],
          createdById: user.id
        }
      });
      return ok({ policy }, { status: 201 });
    }

    if (data.action === "PUBLISH") {
      const policy = await prisma.policyDocument.update({
        where: { id: data.policyId },
        data: { status: "PUBLISHED", publishedAt: new Date() }
      });
      const dueAt = new Date(Date.now() + policy.dueDays * 24 * 60 * 60 * 1000);
      await prisma.policyAssignment.createMany({
        data: Array.from(new Set(data.userIds)).map((userId) => ({ policyId: policy.id, userId, dueAt })),
        skipDuplicates: true
      });
      await Promise.all(
        Array.from(new Set(data.userIds)).map((userId) =>
          createNotification({
            userId,
            workspaceId: policy.workspaceId,
            type: "POLICY_ASSIGNED",
            title: `Policy acknowledgment required: ${policy.title}`,
            body: `Due ${dueAt.toLocaleDateString("en-GB")}`,
            href: "/dashboard/operations?tab=policies",
            priority: NotificationPriority.HIGH
          })
        )
      );
      return ok({ policy });
    }

    if (data.action === "REMIND") {
      const policy = await prisma.policyDocument.findUnique({ where: { id: data.policyId } });
      if (!policy) throw new ApiError(404, "Policy not found.");
      const outstanding = await prisma.policyAssignment.findMany({
        where: { policyId: policy.id, acknowledgedAt: null }
      });
      await Promise.all(
        outstanding.map((assignment) =>
          createNotification({
            userId: assignment.userId,
            workspaceId: policy.workspaceId,
            type: "POLICY_REMINDER",
            title: `Reminder: ${policy.title}`,
            href: "/dashboard/operations?tab=policies",
            priority: NotificationPriority.HIGH
          })
        )
      );
      await prisma.policyAssignment.updateMany({
        where: { id: { in: outstanding.map((assignment) => assignment.id) } },
        data: { reminderSentAt: new Date() }
      });
      return ok({ reminded: outstanding.length });
    }

    const policy = await prisma.policyDocument.update({
      where: { id: data.policyId },
      data: { status: data.status }
    });
    return ok({ policy });
  } catch (error) {
    return handleRouteError(error);
  }
}
