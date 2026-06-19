import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type ActivityInput = {
  userId?: string;
  workspaceId?: string;
  action: string;
  targetId?: string;
  metadata?: Prisma.InputJsonObject;
};

export async function logActivity(input: ActivityInput) {
  return prisma.activityLog.create({
    data: {
      userId: input.userId,
      workspaceId: input.workspaceId,
      action: input.action,
      targetId: input.targetId,
      metadata: input.metadata
    }
  });
}

export const activityActions = {
  workspaceCreated: "workspace.created",
  workspaceDeleted: "workspace.deleted",
  userJoinedWorkspace: "workspace.user_joined",
  folderCreated: "folder.created",
  fileUploaded: "file.uploaded",
  fileDeleted: "file.deleted",
  memberUpdated: "workspace.member_updated",
  memberRemoved: "workspace.member_removed",
  rolePermissionsUpdated: "workspace.role_permissions_updated",
  channelCreated: "chat.channel_created",
  channelDeleted: "chat.channel_deleted",
  messageCreated: "chat.message_created",
  messageEdited: "chat.message_edited",
  messageDeleted: "chat.message_deleted",
  directMessageCreated: "chat.direct_message_created",
  directMessageEdited: "chat.direct_message_edited",
  directMessageDeleted: "chat.direct_message_deleted",
  orgChatMessageCreated: "chat.org_message_created",
  orgChatMessageEdited: "chat.org_message_edited",
  orgChatMessageDeleted: "chat.org_message_deleted",
  integrationCreated: "integration.created",
  integrationDeleted: "integration.deleted",
  webhookReceived: "integration.webhook_received",
  announcementCreated: "announcement.created",
  approvalReviewed: "approval.reviewed",
  taskCreated: "task.created",
  taskUpdated: "task.updated",
  taskDeleted: "task.deleted",
  meetingScheduled: "meeting.scheduled",
  meetingCancelled: "meeting.cancelled",
  meetingCleared: "meeting.cleared",
  meetingResponseUpdated: "meeting.response_updated",
  fileShareLinkCreated: "file.share_link_created",
  companyInvitationResent: "company_invitation.resent",
  companyInvitationCleared: "company_invitation.cleared",
  passwordResetRequested: "auth.password_reset_requested",
  passwordResetCompleted: "auth.password_reset_completed",
  userSuspended: "user.suspended",
  userRestored: "user.restored",
  userAccessRevoked: "user.access_revoked",
  userDeleted: "user.deleted",
  memberProfileUpdated: "member.profile_updated",
  complianceCampaignCreated: "compliance.campaign_created",
  complianceCampaignLaunched: "compliance.campaign_launched",
  complianceFormSubmitted: "compliance.form_submitted",
  complianceFormEdited: "compliance.form_edited",
  complianceFormDeleted: "compliance.form_deleted",
  workspaceFormResponseEdited: "form.response_edited",
  workspaceFormResponseDeleted: "form.response_deleted",
  complianceAssignmentReviewed: "compliance.assignment_reviewed",
  memberSanctionIssued: "member.sanction_issued",
  memberSanctionLifted: "member.sanction_lifted",
  ministryDeleted: "church.ministry_deleted",
  churchEventDeleted: "church.event_deleted",
  pastoralFollowUpDeleted: "church.follow_up_deleted",
  churchResourceDeleted: "church.resource_deleted",
  resourceBookingDeleted: "church.booking_deleted",
  organizationUnitCreated: "organization.unit_created",
  organizationLeaderAssigned: "organization.leader_assigned",
  safeguardingCaseCreated: "safeguarding.case_created",
  safeguardingCaseUpdated: "safeguarding.case_updated",
  aiAgentCreated: "ai.agent_created",
  aiAgentUpdated: "ai.agent_updated",
  contentFreshnessScanRun: "governance.freshness_scan_run",
  communicationSafetyScanRun: "safety.communication_scan_run",
  emergencyCreated: "emergency.created",
  emergencyUpdated: "emergency.updated",
  membershipCardIssued: "membership.card_issued",
  membershipCardUpdated: "membership.card_updated",
  profilePhotoUploaded: "profile.photo_uploaded",
  governanceHoldCreated: "governance.hold_created",
  governanceHoldReleased: "governance.hold_released",
  resourcePassCreated: "resource.pass_created",
  resourceCheckedIn: "resource.checked_in",
  resourceCheckedOut: "resource.checked_out"
} as const;
