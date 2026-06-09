import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128)
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
  description: z.string().trim().max(240).optional().or(z.literal(""))
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
  canCreateAnnouncements: z.boolean(),
  canManageTasks: z.boolean(),
  canCreateShareLinks: z.boolean()
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(2).max(80),
  image: z.string().url().max(2048).optional().or(z.literal(""))
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
  attachmentFileId: z.string().cuid().optional().nullable()
});

export const startDirectConversationSchema = z.object({
  targetUserId: z.string().cuid()
});

export const createDirectMessageSchema = z.object({
  body: z.string().trim().min(1).max(4000)
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
  dueDate: z.string().datetime().optional().nullable().or(z.literal("")),
  assignedToId: z.string().cuid().optional().nullable().or(z.literal(""))
});

export const updateTaskSchema = createTaskSchema.partial().extend({
  status: z.enum(["TODO", "IN_PROGRESS", "BLOCKED", "DONE"]).optional()
});

export const createWorkspaceMeetingSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).optional().or(z.literal("")),
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

export const createFileShareLinkSchema = z.object({
  expiresInDays: z.number().int().min(1).max(365).optional().nullable()
});

export const updateUserAccessSchema = z.object({
  action: z.enum(["SUSPEND", "RESTORE", "REVOKE", "DELETE"])
});
