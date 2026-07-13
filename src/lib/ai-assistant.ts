import { ApprovalStatus, FileScanStatus, PolicyStatus, WikiPageStatus, WorkspaceRole } from "@prisma/client";

import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  getRolePermissions,
  hasAnyWorkspaceAdminRole,
  requireWorkspaceDepartmentAccess,
  requireWorkspaceDepartmentChatAccess
} from "@/lib/rbac";
import { getObjectBuffer } from "@/lib/storage";

export const aiAssistantModes = ["ASK", "SUMMARIZE", "DRAFT", "ACTION_ITEMS", "REPORT", "TRANSLATE"] as const;
export type AiAssistantMode = (typeof aiAssistantModes)[number];

export type AiSource = {
  id: string;
  type: "announcement" | "task" | "knowledge" | "meeting" | "chat" | "policy" | "file";
  title: string;
  workspaceId: string | null;
  workspaceName: string | null;
  href: string;
  excerpt: string;
  updatedAt: string;
};

type AccessContext = {
  isAdmin: boolean;
  workspaceIds: string[];
  chatWorkspaceIds: string[];
  workspaceRoles: Map<string, WorkspaceRole>;
};

function normalizeTerms(question: string) {
  return Array.from(
    new Set(
      question
        .toLowerCase()
        .replace(/[^a-z0-9@]+/g, " ")
        .split(/\s+/)
        .filter((term) => term.length >= 3)
    )
  ).slice(0, 16);
}

function scoreText(text: string, terms: string[], updatedAt: Date) {
  const normalized = text.toLowerCase();
  const termScore = terms.reduce((score, term) => score + (normalized.includes(term) ? 8 : 0), 0);
  const ageDays = Math.max(0, (Date.now() - updatedAt.getTime()) / 86_400_000);
  return termScore + Math.max(0, 5 - ageDays / 30);
}

function cleanExcerpt(value: string | null | undefined, max = 3_500) {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

async function getAccessContext(userId: string): Promise<AccessContext> {
  const isAdmin = await hasAnyWorkspaceAdminRole(userId);
  const memberships = await prisma.workspaceMember.findMany({
    where: {
      userId,
      workspace: { deletedAt: null }
    },
    select: {
      workspaceId: true,
      role: true
    }
  });
  const workspaceRoles = new Map(memberships.map((membership) => [membership.workspaceId, membership.role]));
  const candidates = isAdmin
    ? await prisma.workspace.findMany({
        where: { deletedAt: null },
        select: { id: true }
      })
    : memberships.map((membership) => ({ id: membership.workspaceId }));
  const workspaceIds: string[] = [];
  const chatWorkspaceIds: string[] = [];

  for (const workspace of candidates) {
    if (!isAdmin) {
      try {
        await requireWorkspaceDepartmentAccess(userId, workspace.id);
      } catch {
        continue;
      }
    }
    workspaceIds.push(workspace.id);

    try {
      await requireWorkspaceDepartmentChatAccess(userId, workspace.id);
      chatWorkspaceIds.push(workspace.id);
    } catch {
      // Chat can be narrower than general workspace access.
    }
  }

  return { isAdmin, workspaceIds, chatWorkspaceIds, workspaceRoles };
}

async function extractFileText(file: {
  storageKey: string;
  fileName: string;
  fileType: string;
  size: number;
}) {
  if (file.size > 12_000_000) {
    return "";
  }

  const lowerName = file.fileName.toLowerCase();
  const isText =
    file.fileType.startsWith("text/") ||
    lowerName.endsWith(".txt") ||
    lowerName.endsWith(".md") ||
    lowerName.endsWith(".csv") ||
    lowerName.endsWith(".json");
  const isDocx =
    file.fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lowerName.endsWith(".docx");
  const isPdf = file.fileType === "application/pdf" || lowerName.endsWith(".pdf");

  if (!isText && !isDocx && !isPdf) {
    return "";
  }

  const buffer = await getObjectBuffer(file.storageKey);
  if (isText) {
    return buffer.toString("utf8").slice(0, 18_000);
  }
  if (isDocx) {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    return result.value.slice(0, 18_000);
  }

  const pdfParse = (await import("pdf-parse")).default;
  const result = await pdfParse(buffer);
  return result.text.slice(0, 18_000);
}

export async function collectAuthorizedAiSources(input: {
  userId: string;
  question: string;
  mode: AiAssistantMode;
  workspaceId?: string | null;
}) {
  const access = await getAccessContext(input.userId);
  let workspaceIds = access.workspaceIds;

  if (input.workspaceId) {
    if (!workspaceIds.includes(input.workspaceId)) {
      throw new ApiError(403, "You do not have permission to access that information.");
    }
    workspaceIds = [input.workspaceId];
  }

  if (!workspaceIds.length) {
    return { access, workspaceIds, sources: [] as AiSource[] };
  }

  const terms = normalizeTerms(input.question);
  const chatWorkspaceIds = access.chatWorkspaceIds.filter((id) => workspaceIds.includes(id));
  const [announcements, tasks, wikiPages, meetings, chats, policies, files] = await Promise.all([
    prisma.workspaceAnnouncement.findMany({
      where: {
        workspaceId: { in: workspaceIds },
        approvalStatus: ApprovalStatus.APPROVED
      },
      include: { workspace: { select: { name: true } } },
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
      take: 40
    }),
    prisma.workspaceTask.findMany({
      where: {
        workspaceId: { in: workspaceIds },
        approvalStatus: ApprovalStatus.APPROVED,
        OR: [
          { assignedToId: input.userId },
          { assignees: { some: { userId: input.userId } } },
          ...(access.isAdmin ? [{}] : workspaceIds.map((workspaceId) => ({ workspaceId })))
        ]
      },
      include: {
        workspace: { select: { name: true } },
        assignedTo: { select: { name: true, email: true } },
        assignees: { include: { user: { select: { name: true, email: true } } } }
      },
      orderBy: { updatedAt: "desc" },
      take: 40
    }),
    prisma.wikiPage.findMany({
      where: {
        workspaceId: { in: workspaceIds },
        status: WikiPageStatus.PUBLISHED
      },
      include: { workspace: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 35
    }),
    prisma.workspaceMeeting.findMany({
      where: {
        workspaceId: { in: workspaceIds },
        approvalStatus: ApprovalStatus.APPROVED,
        cancelledAt: null
      },
      include: { workspace: { select: { name: true } } },
      orderBy: { startsAt: "desc" },
      take: 30
    }),
    chatWorkspaceIds.length
      ? prisma.chatMessage.findMany({
          where: {
            channel: { workspaceId: { in: chatWorkspaceIds } },
            deletedAt: null,
            body: { not: "" }
          },
          include: {
            channel: {
              include: {
                workspace: { select: { name: true } }
              }
            },
            author: { select: { name: true, email: true } }
          },
          orderBy: { createdAt: "desc" },
          take: 60
        })
      : Promise.resolve([]),
    prisma.policyDocument.findMany({
      where: {
        status: PolicyStatus.PUBLISHED,
        OR: [{ workspaceId: null }, { workspaceId: { in: workspaceIds } }]
      },
      orderBy: { updatedAt: "desc" },
      take: 30
    }),
    prisma.file.findMany({
      where: {
        workspaceId: { in: workspaceIds },
        approvalStatus: ApprovalStatus.APPROVED,
        deletedAt: null,
        dlpRestricted: false,
        aiRestricted: false,
        sensitivityLabel: {
          notIn: [
            "PASTORAL_CONFIDENTIAL",
            "FINANCE_CONFIDENTIAL",
            "BOARD_ONLY",
            "LEGAL_HOLD",
            "SAFEGUARDING_RESTRICTED"
          ]
        },
        scanStatus: { not: FileScanStatus.INFECTED }
      },
      include: { workspace: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 25
    })
  ]);

  const candidates: Array<AiSource & { score: number }> = [
    ...announcements.map((item) => ({
      id: item.id,
      type: "announcement" as const,
      title: item.title,
      workspaceId: item.workspaceId,
      workspaceName: item.workspace.name,
      href: `/dashboard/workspaces/${item.workspaceId}`,
      excerpt: cleanExcerpt(item.body),
      updatedAt: item.updatedAt.toISOString(),
      score: scoreText(`${item.title} ${item.body}`, terms, item.updatedAt) + (item.pinned ? 2 : 0)
    })),
    ...tasks.map((item) => {
      const assignees = [
        item.assignedTo?.name ?? item.assignedTo?.email,
        ...item.assignees.map((assignment) => assignment.user.name ?? assignment.user.email)
      ]
        .filter(Boolean)
        .join(", ");
      return {
        id: item.id,
        type: "task" as const,
        title: item.title,
        workspaceId: item.workspaceId,
        workspaceName: item.workspace.name,
        href: `/dashboard/workspaces/${item.workspaceId}`,
        excerpt: cleanExcerpt(
          `${item.description ?? ""} Status: ${item.status}. Priority: ${item.priority}. Due: ${
            item.dueDate?.toISOString() ?? "none"
          }. Assigned to: ${assignees || "unassigned"}.`
        ),
        updatedAt: item.updatedAt.toISOString(),
        score: scoreText(`${item.title} ${item.description ?? ""} ${assignees}`, terms, item.updatedAt)
      };
    }),
    ...wikiPages.map((item) => ({
      id: item.id,
      type: "knowledge" as const,
      title: item.title,
      workspaceId: item.workspaceId,
      workspaceName: item.workspace.name,
      href: `/dashboard/workspaces/${item.workspaceId}`,
      excerpt: cleanExcerpt(item.content),
      updatedAt: item.updatedAt.toISOString(),
      score: scoreText(`${item.title} ${item.content}`, terms, item.updatedAt)
    })),
    ...meetings.map((item) => ({
      id: item.id,
      type: "meeting" as const,
      title: item.title,
      workspaceId: item.workspaceId,
      workspaceName: item.workspace.name,
      href: `/dashboard/meetings/${item.id}`,
      excerpt: cleanExcerpt(
        [
          item.description,
          item.agenda,
          item.transcriptSummary,
          item.transcript,
          item.notes,
          item.actionItems
        ]
          .filter(Boolean)
          .join("\n")
      ),
      updatedAt: item.updatedAt.toISOString(),
      score: scoreText(
        `${item.title} ${item.description ?? ""} ${item.transcriptSummary ?? ""} ${item.transcript ?? ""}`,
        terms,
        item.updatedAt
      )
    })),
    ...chats.map((item) => ({
      id: item.id,
      type: "chat" as const,
      title: `#${item.channel.name} message`,
      workspaceId: item.channel.workspaceId,
      workspaceName: item.channel.workspace.name,
      href: `/dashboard/workspaces/${item.channel.workspaceId}`,
      excerpt: cleanExcerpt(`${item.author?.name ?? item.author?.email ?? "Member"}: ${item.body}`),
      updatedAt: item.updatedAt.toISOString(),
      score: scoreText(item.body, terms, item.updatedAt)
    })),
    ...policies.map((item) => ({
      id: item.id,
      type: "policy" as const,
      title: item.title,
      workspaceId: item.workspaceId,
      workspaceName: null,
      href: item.workspaceId ? `/dashboard/workspaces/${item.workspaceId}` : "/dashboard/operations",
      excerpt: cleanExcerpt(`${item.summary ?? ""}\n${item.content}`),
      updatedAt: item.updatedAt.toISOString(),
      score: scoreText(`${item.title} ${item.summary ?? ""} ${item.content}`, terms, item.updatedAt) + 2
    }))
  ];

  const rankedFiles = files
    .map((item) => ({
      item,
      score: scoreText(item.fileName, terms, item.updatedAt)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, input.mode === "SUMMARIZE" ? 4 : 2);

  for (const { item, score } of rankedFiles) {
    try {
      const text = await extractFileText(item);
      if (!text) continue;
      candidates.push({
        id: item.id,
        type: "file",
        title: item.fileName,
        workspaceId: item.workspaceId,
        workspaceName: item.workspace.name,
        href: `/api/files/${item.id}/preview`,
        excerpt: cleanExcerpt(text, 12_000),
        updatedAt: item.updatedAt.toISOString(),
        score: score + 3
      });
    } catch {
      // Unsupported or temporarily unavailable files remain invisible to the model.
    }
  }

  const sources = candidates
    .filter((source) => source.excerpt)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map(({ score: _score, ...source }) => source);

  return { access, workspaceIds, sources };
}

export async function describeAiAccess(userId: string) {
  const access = await getAccessContext(userId);
  const workspaces = await prisma.workspace.findMany({
    where: { id: { in: access.workspaceIds }, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" }
  });
  const role = access.isAdmin
    ? "ADMIN"
    : Array.from(access.workspaceRoles.values()).includes(WorkspaceRole.LEADER)
      ? "LEADER"
      : Array.from(access.workspaceRoles.values()).includes(WorkspaceRole.MODERATOR)
        ? "MODERATOR"
        : "USER";

  return { role, workspaces };
}

export async function canUseWorkspaceAi(userId: string, workspaceId: string) {
  if (await hasAnyWorkspaceAdminRole(userId)) return true;
  const membership = await prisma.workspaceMember.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } }
  });
  if (!membership) return false;
  await requireWorkspaceDepartmentAccess(userId, workspaceId);
  const permissions = await getRolePermissions(workspaceId, membership.role);
  return membership.role === WorkspaceRole.USER || membership.role === WorkspaceRole.VIEWER || permissions.canViewActivity;
}
