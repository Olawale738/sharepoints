import { z } from "zod";

import { supportedLocales } from "@/lib/i18n";

const chatMessageIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(191)
  .regex(/^[A-Za-z0-9_-]+$/, "Invalid message ID");

export const loginSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
  otp: z.string().trim().regex(/^\d{6}$/).optional().or(z.literal(""))
});

export const registerSchema = loginSchema.extend({
  name: z.string().trim().min(2).max(80)
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.toLowerCase())
});

export const resetPasswordSchema = z
  .object({
    email: z.string().email().max(254).transform((value) => value.toLowerCase()),
    token: z.string().min(32).max(256),
    password: z.string().min(8).max(128),
    confirmPassword: z.string().min(8).max(128)
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"]
  });

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(240).optional().or(z.literal("")),
  templateId: z.string().cuid().optional().nullable().or(z.literal("")),
  organizationUnitId: z.string().cuid().optional().nullable().or(z.literal(""))
});

export const joinWorkspaceSchema = z.object({
  joinCode: z.string().trim().min(4).max(120)
});

export const createFolderSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[^<>:"/\\|?*\u0000-\u001F]+$/, "Folder name contains unsupported characters."),
  parentId: z.string().cuid().optional().nullable()
});

export const uploadFileSchema = z.object({
  workspaceId: z.string().cuid(),
  folderId: z.string().cuid().optional().nullable()
});

export const updateWorkspaceMemberSchema = z.object({
  role: z.enum(["ADMIN", "LEADER", "MODERATOR", "USER"])
});

export const updateWorkspaceRolePermissionSchema = z.object({
  role: z.enum(["LEADER", "MODERATOR"]),
  canUploadFiles: z.boolean(),
  canDeleteFiles: z.boolean(),
  canCreateFolders: z.boolean(),
  canCreateChannels: z.boolean(),
  canSendMessages: z.boolean(),
  canManageMembers: z.boolean(),
  canManageIntegrations: z.boolean(),
  canViewActivity: z.boolean(),
  canClearActivity: z.boolean(),
  canCreateAnnouncements: z.boolean(),
  canManageTasks: z.boolean(),
  canScheduleMeetings: z.boolean(),
  canCreateShareLinks: z.boolean(),
  canUseWhatsAppCommandBot: z.boolean(),
  canManageDigitalSignatures: z.boolean(),
  canManageEvidenceVault: z.boolean(),
  canViewExecutiveBriefing: z.boolean(),
  canDeleteReports: z.boolean(),
  canClearReportLogs: z.boolean()
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  image: z
    .string()
    .max(2048)
    .refine(
      (value) => value === "" || value.startsWith("/api/profile/photo/") || z.string().url().safeParse(value).success,
      "Profile image must be a valid LETW photo or URL."
    )
    .optional(),
  organizationPosition: z.string().trim().max(120).optional().or(z.literal("")),
  digitalIdLocation: z.string().trim().max(160).optional().or(z.literal("")),
  locale: z.enum(supportedLocales).optional()
});

export const inviteCompanyEmailSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.toLowerCase())
});

export const createChannelSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-zA-Z0-9][a-zA-Z0-9 ._-]*$/, "Channel name contains unsupported characters."),
  description: z.string().trim().max(180).optional().or(z.literal(""))
});

export const createChatMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  attachmentFileId: z.string().cuid().optional().nullable(),
  replyToId: chatMessageIdSchema.optional().nullable(),
  forwardedFromId: chatMessageIdSchema.optional().nullable()
});

export const startDirectConversationSchema = z.object({
  targetUserId: z.string().cuid()
});

export const createDirectMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  replyToId: chatMessageIdSchema.optional().nullable(),
  forwardedFromId: chatMessageIdSchema.optional().nullable()
});

export const updateMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000)
});

export const createIntegrationSchema = z.object({
  name: z.string().trim().min(2).max(80),
  channelId: z.string().cuid().optional().nullable(),
  targetUrl: z.string().url().max(2048).optional().or(z.literal(""))
});

export const incomingWebhookSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  username: z.string().trim().min(1).max(80).optional()
});

export const createAnnouncementSchema = z.object({
  title: z.string().trim().min(2).max(120),
  body: z.string().trim().min(1).max(4000),
  pinned: z.boolean().optional()
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE"]).optional(),
  priority: z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]).optional(),
  dueDate: z.string().datetime().optional().nullable().or(z.literal("")),
  reminderAt: z.string().datetime().optional().nullable().or(z.literal("")),
  assignedToId: z.string().cuid().optional().nullable().or(z.literal("")),
  assigneeIds: z.array(z.string().cuid()).optional()
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE"]).optional()
});

export const createWorkspaceMeetingSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    meetingType: z.enum(["AUDIO", "VIDEO"]).optional(),
    description: z.string().trim().max(1000).optional().or(z.literal("")),
    agenda: z.string().trim().max(2000).optional().or(z.literal("")),
    recordingUrl: z.string().url().max(2048).optional().or(z.literal("")),
    autoRecord: z.boolean().optional(),
    recordingMode: z.enum(["file", "local", "stream"]).optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime()
  })
  .refine((value) => new Date(value.endsAt).getTime() > new Date(value.startsAt).getTime(), {
    message: "Meeting end time must be after the start time.",
    path: ["endsAt"]
  });

export const updateMeetingResponseSchema = z.object({
  status: z.enum(["YES", "MAYBE", "NO"])
});

export const updateMeetingDetailsSchema = z.object({
  meetingType: z.enum(["AUDIO", "VIDEO"]).optional(),
  agenda: z.string().trim().max(2000).optional().or(z.literal("")),
  notes: z.string().trim().max(4000).optional().or(z.literal("")),
  actionItems: z.string().trim().max(4000).optional().or(z.literal("")),
  recordingUrl: z.string().url().max(2048).optional().or(z.literal("")),
  autoRecord: z.boolean().optional(),
  recordingMode: z.enum(["file", "local", "stream"]).optional(),
  recordingStatus: z.string().trim().max(80).optional().or(z.literal("")),
  recordingError: z.string().trim().max(500).optional().or(z.literal(""))
});

export const approvalDecisionSchema = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
  reason: z.string().trim().max(500).optional().or(z.literal(""))
});

export const createTaskCommentSchema = z.object({
  body: z.string().trim().min(1).max(2000)
});

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(2).max(80),
  kind: z.enum(["DEPARTMENT", "MINISTRY_UNIT", "CATEGORY"]).optional(),
  description: z.string().trim().max(240).optional().or(z.literal(""))
});

export const upsertWorkspaceDepartmentAccessSchema = z.object({
  departmentId: z.string().cuid(),
  canAccessWorkspace: z.boolean(),
  canAccessChat: z.boolean()
});

export const updateUserOrganizationSchema = z.object({
  departmentId: z.string().cuid().optional().nullable().or(z.literal("")),
  category: z.string().trim().max(80).optional().nullable().or(z.literal("")),
  forcePasswordReset: z.boolean().optional(),
  singleActiveSession: z.boolean().optional()
});

export const searchSchema = z.object({
  q: z.string().trim().min(1).max(120)
});

export const createFileShareLinkSchema = z.object({
  expiresInDays: z.number().int().min(1).max(365).optional().nullable()
});

export const updateUserAccessSchema = z.object({
  action: z.enum(["SUSPEND", "RESTORE", "REVOKE", "DELETE"])
});

export const chatCollaborationSchema = z.object({
  action: z.enum(["REACT", "BOOKMARK", "PIN", "READ", "TYPING"]),
  messageKind: z.enum(["channel", "direct", "organization"]).optional(),
  messageId: chatMessageIdSchema.optional(),
  emoji: z.string().trim().min(1).max(16).optional(),
  scopeKind: z.enum(["channel", "direct", "organization"]).optional(),
  scopeId: z.string().cuid().optional(),
  active: z.boolean().optional()
});

export const notificationPreferenceSchema = z.object({
  browserEnabled: z.boolean().optional(),
  emailMentions: z.boolean().optional(),
  emailTasks: z.boolean().optional(),
  emailMeetings: z.boolean().optional(),
  emailApprovals: z.boolean().optional(),
  pushEnabled: z.boolean().optional(),
  digest: z.enum(["IMMEDIATE", "DAILY", "WEEKLY", "NEVER"]).optional(),
  quietHoursStart: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable().or(z.literal("")),
  quietHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable().or(z.literal("")),
  timeZone: z.string().trim().min(1).max(80).optional()
});

export const createWikiPageSchema = z.object({
  title: z.string().trim().min(2).max(160),
  content: z.string().trim().min(1).max(50_000),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional()
});

export const updateWikiPageSchema = createWikiPageSchema.partial();

export const formFieldSchema = z.object({
  id: z.string().trim().min(1).max(80),
  label: z.string().trim().min(1).max(160),
  type: z.enum(["TEXT", "LONG_TEXT", "EMAIL", "NUMBER", "DATE", "CHOICE", "CHECKBOX"]),
  required: z.boolean().optional(),
  options: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  placeholder: z.string().trim().max(160).optional(),
  condition: z
    .object({
      fieldId: z.string().trim().min(1).max(80),
      operator: z.enum(["EQUALS", "NOT_EQUALS", "CONTAINS", "CHECKED"]),
      value: z.union([z.string().max(500), z.boolean()]).optional()
    })
    .optional()
});

export const createWorkspaceFormSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional().or(z.literal("")),
  status: z.enum(["DRAFT", "OPEN", "CLOSED"]).optional(),
  fields: z.array(formFieldSchema).min(1).max(40),
  requiresApproval: z.boolean().optional(),
  signatureRequired: z.boolean().optional(),
  paymentRequired: z.boolean().optional(),
  paymentAmount: z.number().int().nonnegative().optional().nullable(),
  paymentCurrency: z.string().trim().length(3).optional(),
  paymentUrl: z.string().url().optional().nullable().or(z.literal(""))
});

export const submitWorkspaceFormSchema = z.object({
  answers: z.record(z.union([z.string().max(5000), z.number(), z.boolean(), z.array(z.string().max(500))])),
  signatureName: z.string().trim().max(120).optional().nullable(),
  paymentReference: z.string().trim().max(160).optional().nullable()
});

export const fileGovernanceSchema = z.object({
  action: z.enum(["CHECK_OUT", "CHECK_IN", "SET_RETENTION", "SET_LEGAL_HOLD"]),
  retentionUntil: z.string().datetime().optional().nullable().or(z.literal("")),
  legalHold: z.boolean().optional()
});

export const fileCommentSchema = z.object({
  body: z.string().trim().min(1).max(4000)
});

export const twoFactorCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/)
});

export const deviceHeartbeatSchema = z.object({
  deviceKey: z.string().trim().min(8).max(160),
  name: z.string().trim().max(120).optional().or(z.literal("")),
  userAgent: z.string().trim().max(1000).optional().or(z.literal(""))
});
