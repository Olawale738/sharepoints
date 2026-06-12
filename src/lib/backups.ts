import { createHash } from "node:crypto";

import { prisma } from "@/lib/prisma";
import { uploadObject } from "@/lib/storage";

async function getWorkspaceBackupPayload(workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      members: true,
      rolePermissions: true,
      departmentAccesses: true,
      announcements: true,
      tasks: { include: { assignees: true, comments: true } },
      meetings: { include: { responses: true } },
      folders: true,
      files: { include: { versions: true, comments: true, shareLinks: true } },
      chatChannels: { include: { messages: true } },
      directConversations: { include: { messages: true } },
      integrations: true,
      activityLogs: true,
      approvalRequests: true,
      wikiPages: true,
      forms: { include: { responses: true } },
      notifications: true,
      messagePins: true
    }
  });

  if (!workspace) return null;

  const meetingIds = workspace.meetings.map((meeting) => meeting.id);
  const churchEvents = await prisma.churchEvent.findMany({ where: { workspaceId } });
  const churchEventIds = churchEvents.map((event) => event.id);
  const ministries = await prisma.ministry.findMany({ where: { workspaceId } });
  const workflows = await prisma.workflowDefinition.findMany({ where: { workspaceId } });
  const workflowIds = workflows.map((workflow) => workflow.id);
  const resourceBookings = await prisma.resourceBooking.findMany({ where: { workspaceId } });
  const resourceIds = resourceBookings.map((booking) => booking.resourceId);
  const resources = await prisma.churchResource.findMany({ where: { id: { in: resourceIds } } });

  const [
    workflowRuns,
    recycleBin,
    dlpRules,
    dlpIncidents,
    meetingAttendance,
    meetingActionItems,
    churchAttendance,
    volunteerAssignments,
    pastoralFollowUps,
    visitorJourneys,
    helpDeskTickets,
    eventTicketConfigurations,
    eventRegistrations,
    policies,
    leaveRequests,
    dutySchedules
  ] = await Promise.all([
    prisma.workflowRun.findMany({ where: { workflowId: { in: workflowIds } } }),
    prisma.recycleBinItem.findMany({ where: { workspaceId } }),
    prisma.dlpRule.findMany({ where: { workspaceId } }),
    prisma.dlpIncident.findMany({ where: { workspaceId } }),
    prisma.meetingAttendance.findMany({ where: { meetingId: { in: meetingIds } } }),
    prisma.meetingActionItem.findMany({ where: { meetingId: { in: meetingIds } } }),
    prisma.churchAttendance.findMany({ where: { eventId: { in: churchEventIds } } }),
    prisma.volunteerAssignment.findMany({ where: { eventId: { in: churchEventIds } } }),
    prisma.pastoralFollowUp.findMany({ where: { workspaceId } }),
    prisma.visitorJourney.findMany({ where: { workspaceId } }),
    prisma.helpDeskTicket.findMany({ where: { workspaceId } }),
    prisma.eventTicketConfiguration.findMany({ where: { eventId: { in: churchEventIds } } }),
    prisma.eventRegistration.findMany({ where: { eventId: { in: churchEventIds } } }),
    prisma.policyDocument.findMany({ where: { workspaceId } }),
    prisma.leaveRequest.findMany({ where: { workspaceId } }),
    prisma.dutySchedule.findMany({ where: { workspaceId } })
  ]);

  const visitorJourneyIds = visitorJourneys.map((journey) => journey.id);
  const helpDeskTicketIds = helpDeskTickets.map((ticket) => ticket.id);
  const policyIds = policies.map((policy) => policy.id);
  const [visitorNotes, visitorStageHistory, helpDeskComments, policyAssignments] = await Promise.all([
    prisma.visitorJourneyNote.findMany({ where: { journeyId: { in: visitorJourneyIds } } }),
    prisma.visitorStageHistory.findMany({ where: { journeyId: { in: visitorJourneyIds } } }),
    prisma.helpDeskComment.findMany({ where: { ticketId: { in: helpDeskTicketIds } } }),
    prisma.policyAssignment.findMany({ where: { policyId: { in: policyIds } } })
  ]);

  return {
    workspace,
    workflows,
    workflowRuns,
    recycleBin,
    dlpRules,
    dlpIncidents,
    meetingAttendance,
    meetingActionItems,
    ministries,
    churchEvents,
    churchAttendance,
    volunteerAssignments,
    pastoralFollowUps,
    resources,
    resourceBookings,
    visitorJourneys,
    visitorNotes,
    visitorStageHistory,
    helpDeskTickets,
    helpDeskComments,
    eventTicketConfigurations,
    eventRegistrations,
    policies,
    policyAssignments,
    leaveRequests,
    dutySchedules
  };
}

export async function createWorkspaceBackup(workspaceId: string | null, createdById: string, name: string) {
  const record = await prisma.backupSnapshot.create({
    data: {
      workspaceId,
      createdById,
      name,
      status: "PENDING"
    }
  });

  try {
    const payload = workspaceId
      ? await getWorkspaceBackupPayload(workspaceId)
      : {
          exportedAt: new Date().toISOString(),
          users: await prisma.user.findMany(),
          invitations: await prisma.companyEmailInvitation.findMany(),
          departments: await prisma.department.findMany(),
          workspaceTemplates: await prisma.workspaceTemplate.findMany(),
          organizationChatRooms: await prisma.orgChatRoom.findMany({
            include: { messages: true }
          }),
          notificationPreferences: await prisma.notificationPreference.findMany(),
          pushSubscriptions: await prisma.pushSubscription.findMany(),
          securityEvents: await prisma.securityEvent.findMany(),
          adminRolePreviews: await prisma.adminRolePreview.findMany(),
          staffAvailability: await prisma.staffAvailability.findMany(),
          globalDlpRules: await prisma.dlpRule.findMany({ where: { workspaceId: null } }),
          workspaces: await Promise.all(
            (await prisma.workspace.findMany({ select: { id: true } })).map((workspace) =>
              getWorkspaceBackupPayload(workspace.id)
            )
          )
        };

    if (!payload) throw new Error("Workspace not found.");
    const body = Buffer.from(JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), payload }));
    const checksum = createHash("sha256").update(body).digest("hex");
    const storageKey = `backups/${workspaceId ?? "organization"}/${record.id}.json`;
    await uploadObject({
      key: storageKey,
      body,
      contentType: "application/json",
      contentLength: body.length
    });

    return prisma.backupSnapshot.update({
      where: { id: record.id },
      data: {
        status: "COMPLETED",
        storageKey,
        size: body.length,
        checksum,
        completedAt: new Date()
      }
    });
  } catch (error) {
    await prisma.backupSnapshot.update({
      where: { id: record.id },
      data: {
        status: "FAILED",
        errorMessage: error instanceof Error ? error.message : "Backup failed.",
        completedAt: new Date()
      }
    });
    throw error;
  }
}
