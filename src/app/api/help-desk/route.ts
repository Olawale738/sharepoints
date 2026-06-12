import { HelpDeskStatus, NotificationPriority } from "@prisma/client";
import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { createNotification } from "@/lib/notifications";
import { activeOrganizationUsers, isOperationsManager, responseDueAt } from "@/lib/operations";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  category: z.enum(["IT", "FACILITY", "FINANCE", "ADMINISTRATION", "OTHER"]),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]),
  subject: z.string().trim().min(3).max(160),
  description: z.string().trim().min(5).max(10_000),
  workspaceId: z.string().cuid().optional().nullable()
});

const updateSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("UPDATE"),
    id: z.string().cuid(),
    status: z.nativeEnum(HelpDeskStatus).optional(),
    assigneeId: z.string().cuid().optional().nullable(),
    priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional()
  }),
  z.object({
    action: z.literal("COMMENT"),
    id: z.string().cuid(),
    body: z.string().trim().min(1).max(5000),
    internal: z.boolean().optional()
  })
]);

export async function GET() {
  try {
    const user = await requireUser();
    const manager = await isOperationsManager(user.id);
    const [tickets, comments, users] = await Promise.all([
      prisma.helpDeskTicket.findMany({
        where: manager ? {} : { requesterId: user.id },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
        take: 300
      }),
      prisma.helpDeskComment.findMany({
        where: manager
          ? {}
          : {
              ticketId: {
                in: (
                  await prisma.helpDeskTicket.findMany({
                    where: { requesterId: user.id },
                    select: { id: true }
                  })
                ).map((ticket) => ticket.id)
              },
              internal: false
            },
        orderBy: { createdAt: "asc" },
        take: 1000
      }),
      manager ? activeOrganizationUsers() : Promise.resolve([])
    ]);
    return ok({ tickets, comments, users, canManage: manager });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid help request.");
    const ticket = await prisma.helpDeskTicket.create({
      data: {
        requesterId: user.id,
        workspaceId: parsed.data.workspaceId ?? null,
        category: parsed.data.category,
        priority: parsed.data.priority,
        subject: parsed.data.subject,
        description: parsed.data.description,
        responseDueAt: responseDueAt(parsed.data.priority)
      }
    });
    const managers = await prisma.workspaceMember.findMany({
      where: {
        role: { in: ["ADMIN", "LEADER", "MODERATOR", "EDITOR"] },
        workspace: { deletedAt: null }
      },
      distinct: ["userId"],
      select: { userId: true }
    });
    await Promise.all(
      managers.map((manager) =>
        createNotification({
          userId: manager.userId,
          workspaceId: ticket.workspaceId,
          type: "HELP_DESK_CREATED",
          title: `${ticket.priority.toLowerCase()} help request: ${ticket.subject}`,
          href: "/dashboard/operations?tab=helpdesk",
          priority: ticket.priority === "URGENT" ? NotificationPriority.URGENT : NotificationPriority.NORMAL
        })
      )
    );
    return ok({ ticket }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid ticket update.");
    const data = parsed.data;
    const ticket = await prisma.helpDeskTicket.findUnique({ where: { id: data.id } });
    if (!ticket) throw new ApiError(404, "Help request not found.");
    const manager = await isOperationsManager(user.id);
    if (!manager && ticket.requesterId !== user.id) throw new ApiError(403, "You cannot access this request.");

    if (data.action === "COMMENT") {
      if (data.internal && !manager) throw new ApiError(403, "Internal notes are restricted.");
      const comment = await prisma.helpDeskComment.create({
        data: { ticketId: ticket.id, authorId: user.id, body: data.body, internal: data.internal ?? false }
      });
      if (manager && !ticket.firstRespondedAt && !comment.internal) {
        await prisma.helpDeskTicket.update({
          where: { id: ticket.id },
          data: {
            firstRespondedAt: new Date(),
            firstResponseMinutes: Math.max(
              0,
              Math.round((Date.now() - ticket.createdAt.getTime()) / (60 * 1000))
            )
          }
        });
      }
      const notifyUserId = manager ? ticket.requesterId : ticket.assigneeId;
      if (notifyUserId && notifyUserId !== user.id && !comment.internal) {
        await createNotification({
          userId: notifyUserId,
          workspaceId: ticket.workspaceId,
          type: "HELP_DESK_COMMENT",
          title: `New reply on ${ticket.subject}`,
          body: data.body.slice(0, 240),
          href: "/dashboard/operations?tab=helpdesk"
        });
      }
      return ok({ comment });
    }

    if (!manager) throw new ApiError(403, "Only operations managers can assign or change ticket status.");
    const nextPriority = data.priority ?? ticket.priority;
    const updated = await prisma.helpDeskTicket.update({
      where: { id: ticket.id },
      data: {
        status: data.status,
        assigneeId: data.assigneeId,
        priority: data.priority,
        responseDueAt: data.priority ? responseDueAt(nextPriority) : undefined,
        resolvedAt: data.status === "RESOLVED" ? new Date() : undefined,
        closedAt: data.status === "CLOSED" ? new Date() : undefined
      }
    });
    const notifyIds = new Set([ticket.requesterId, updated.assigneeId].filter(Boolean) as string[]);
    notifyIds.delete(user.id);
    await Promise.all(
      Array.from(notifyIds).map((userId) =>
        createNotification({
          userId,
          workspaceId: ticket.workspaceId,
          type: "HELP_DESK_UPDATED",
          title: `${ticket.subject} is now ${updated.status.toLowerCase().replaceAll("_", " ")}`,
          href: "/dashboard/operations?tab=helpdesk"
        })
      )
    );
    return ok({ ticket: updated });
  } catch (error) {
    return handleRouteError(error);
  }
}
