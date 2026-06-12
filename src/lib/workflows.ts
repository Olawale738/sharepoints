import { ApprovalStatus, Prisma, WorkflowTrigger, WorkspaceRole } from "@prisma/client";

import { notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

type WorkflowAction =
  | { type: "REQUEST_APPROVAL" }
  | { type: "NOTIFY_ROLE"; roles: WorkspaceRole[]; title?: string }
  | { type: "ARCHIVE_FILE" }
  | { type: "CREATE_TASK"; title?: string; assigneeId?: string };

export async function runWorkspaceWorkflows(input: {
  workspaceId: string;
  trigger: WorkflowTrigger;
  triggerId?: string;
  actorId: string;
  payload?: Record<string, unknown>;
}) {
  const workflows = await prisma.workflowDefinition.findMany({
    where: {
      workspaceId: input.workspaceId,
      trigger: input.trigger,
      enabled: true
    }
  });

  for (const workflow of workflows) {
    const run = await prisma.workflowRun.create({
      data: {
        workflowId: workflow.id,
        workspaceId: input.workspaceId,
        trigger: input.trigger,
        triggerId: input.triggerId,
        input: input.payload as Prisma.InputJsonValue | undefined
      }
    });

    try {
      const actions = workflow.actions as unknown as WorkflowAction[];
      const output: Array<Record<string, unknown>> = [];

      for (const action of actions) {
        if (action.type === "REQUEST_APPROVAL" && input.triggerId) {
          await prisma.file.updateMany({
            where: { id: input.triggerId, workspaceId: input.workspaceId },
            data: { approvalStatus: ApprovalStatus.PENDING, approvedAt: null, approvedById: null }
          });
          await prisma.approvalRequest.upsert({
            where: { targetType_targetId: { targetType: "FILE", targetId: input.triggerId } },
            update: { status: ApprovalStatus.PENDING, reviewerId: null, reviewedAt: null },
            create: {
              workspaceId: input.workspaceId,
              requesterId: input.actorId,
              targetType: "FILE",
              targetId: input.triggerId,
              title: String(input.payload?.fileName ?? "Uploaded document")
            }
          });
          output.push({ action: action.type, status: "queued" });
        }

        if (action.type === "NOTIFY_ROLE") {
          const members = await prisma.workspaceMember.findMany({
            where: { workspaceId: input.workspaceId, role: { in: action.roles } },
            select: { userId: true }
          });
          await notifyUsers(
            members.map((member) => member.userId),
            {
              workspaceId: input.workspaceId,
              type: "WORKFLOW",
              title: action.title ?? workflow.name,
              body: `Automation triggered by ${input.trigger.toLowerCase().replaceAll("_", " ")}.`,
              href: `/dashboard/workspaces/${input.workspaceId}`
            }
          );
          output.push({ action: action.type, recipients: members.length });
        }

        if (action.type === "ARCHIVE_FILE" && input.triggerId) {
          const archive = await prisma.folder.upsert({
            where: {
              id: `archive-${input.workspaceId}`
            },
            update: {},
            create: {
              id: `archive-${input.workspaceId}`,
              workspaceId: input.workspaceId,
              name: "Archive",
              createdById: input.actorId
            }
          });
          await prisma.file.updateMany({
            where: { id: input.triggerId, workspaceId: input.workspaceId },
            data: { folderId: archive.id }
          });
          output.push({ action: action.type, folderId: archive.id });
        }

        if (action.type === "CREATE_TASK") {
          const task = await prisma.workspaceTask.create({
            data: {
              workspaceId: input.workspaceId,
              title: action.title ?? `Follow up: ${String(input.payload?.fileName ?? workflow.name)}`,
              assignedToId: action.assigneeId ?? null,
              createdById: input.actorId
            }
          });
          output.push({ action: action.type, taskId: task.id });
        }
      }

      await prisma.workflowRun.update({
        where: { id: run.id },
        data: { status: "COMPLETED", output: output as Prisma.InputJsonValue, completedAt: new Date() }
      });
    } catch (error) {
      await prisma.workflowRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          errorMessage: error instanceof Error ? error.message : "Workflow failed.",
          completedAt: new Date()
        }
      });
    }
  }
}
