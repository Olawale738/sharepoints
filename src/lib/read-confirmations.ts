import { NotificationPriority, ReadRequirementTargetType } from "@prisma/client";
import type { Prisma } from "@prisma/client";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError } from "@/lib/api";
import { createNotification, notifyUsers } from "@/lib/notifications";
import { prisma } from "@/lib/prisma";

type AudienceMode = "TARGET_WORKSPACE" | "ORGANIZATION" | "SELECTED" | "POLICY_ASSIGNMENTS";

type TargetDetails = {
  targetType: ReadRequirementTargetType;
  targetId: string;
  title: string;
  workspaceId: string | null;
  href: string;
};

function jsonArray(value: Prisma.JsonValue | null | undefined) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function unique(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

async function activeOrgUserIds() {
  const users = await prisma.user.findMany({
    where: { deletedAt: null, suspendedAt: null, accessRevokedAt: null, email: { endsWith: "@letw.org" } },
    select: { id: true },
    take: 5000
  });
  return users.map((user) => user.id);
}

async function workspaceUserIds(workspaceId: string) {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId, user: { deletedAt: null, suspendedAt: null, accessRevokedAt: null } },
    select: { userId: true },
    take: 5000
  });
  return members.map((member) => member.userId);
}

export async function resolveReadTarget(targetType: ReadRequirementTargetType, targetId: string): Promise<TargetDetails> {
  if (targetType === ReadRequirementTargetType.FILE) {
    const file = await prisma.file.findUnique({
      where: { id: targetId },
      select: { id: true, fileName: true, workspaceId: true, deletedAt: true }
    });
    if (!file || file.deletedAt) throw new ApiError(404, "File not found.");
    return { targetType, targetId, title: file.fileName, workspaceId: file.workspaceId, href: `/api/files/${file.id}/preview` };
  }

  if (targetType === ReadRequirementTargetType.ANNOUNCEMENT) {
    const announcement = await prisma.workspaceAnnouncement.findUnique({
      where: { id: targetId },
      select: { id: true, title: true, workspaceId: true }
    });
    if (!announcement) throw new ApiError(404, "Announcement not found.");
    return {
      targetType,
      targetId,
      title: announcement.title,
      workspaceId: announcement.workspaceId,
      href: `/dashboard/workspaces/${announcement.workspaceId}`
    };
  }

  if (targetType === ReadRequirementTargetType.POLICY) {
    const policy = await prisma.policyDocument.findUnique({
      where: { id: targetId },
      select: { id: true, title: true, workspaceId: true }
    });
    if (!policy) throw new ApiError(404, "Policy not found.");
    return { targetType, targetId, title: policy.title, workspaceId: policy.workspaceId, href: "/dashboard/operations?tab=policies" };
  }

  if (targetType === ReadRequirementTargetType.OFFICIAL_LETTER) {
    const letter = await prisma.officialLetter.findUnique({
      where: { id: targetId },
      select: { id: true, title: true, workspaceId: true }
    });
    if (!letter) throw new ApiError(404, "Official letter not found.");
    return { targetType, targetId, title: letter.title, workspaceId: letter.workspaceId, href: `/api/leadership-governance/letters/${letter.id}/pdf` };
  }

  const report = await prisma.monthlyMinistryReport.findUnique({
    where: { id: targetId },
    select: { id: true, title: true, workspaceId: true }
  });
  if (!report) throw new ApiError(404, "Report not found.");
  return { targetType, targetId, title: report.title, workspaceId: report.workspaceId, href: `/api/leadership-governance/reports/${report.id}/pdf` };
}

async function resolveAudience(input: {
  target: TargetDetails;
  audienceMode: AudienceMode;
  userIds?: string[];
}) {
  if (input.audienceMode === "SELECTED") {
    if (!input.userIds?.length) throw new ApiError(422, "Select at least one member.");
    const users = await prisma.user.findMany({
      where: { id: { in: unique(input.userIds) }, deletedAt: null, suspendedAt: null, accessRevokedAt: null },
      select: { id: true }
    });
    return { label: "Selected LETW members", userIds: users.map((user) => user.id) };
  }

  if (input.audienceMode === "POLICY_ASSIGNMENTS" && input.target.targetType === ReadRequirementTargetType.POLICY) {
    const assignments = await prisma.policyAssignment.findMany({
      where: { policyId: input.target.targetId },
      select: { userId: true }
    });
    return { label: "Policy assigned members", userIds: assignments.map((assignment) => assignment.userId) };
  }

  if (input.audienceMode === "TARGET_WORKSPACE" && input.target.workspaceId) {
    return { label: "Target workspace members", userIds: await workspaceUserIds(input.target.workspaceId) };
  }

  return { label: "All active LETW members", userIds: await activeOrgUserIds() };
}

export async function listReadConfirmationCenter() {
  const [users, files, announcements, policies, letters, reports, requirements, receipts] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null, suspendedAt: null, accessRevokedAt: null, email: { endsWith: "@letw.org" } },
      select: { id: true, name: true, email: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      take: 1000
    }),
    prisma.file.findMany({
      where: { deletedAt: null },
      select: { id: true, fileName: true, workspace: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 120
    }),
    prisma.workspaceAnnouncement.findMany({
      select: { id: true, title: true, workspace: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 120
    }),
    prisma.policyDocument.findMany({
      select: { id: true, title: true, workspaceId: true },
      orderBy: { updatedAt: "desc" },
      take: 120
    }),
    prisma.officialLetter.findMany({
      where: { status: { in: ["ISSUED", "DRAFT"] } },
      select: { id: true, title: true, recipientName: true },
      orderBy: { updatedAt: "desc" },
      take: 120
    }),
    prisma.monthlyMinistryReport.findMany({
      select: { id: true, title: true, month: true, year: true },
      orderBy: [{ year: "desc" }, { month: "desc" }],
      take: 120
    }),
    prisma.documentReadRequirement.findMany({
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      take: 200
    }),
    prisma.documentReadReceipt.findMany({
      select: { requirementId: true, userId: true },
      take: 10000
    })
  ]);

  const receiptsByRequirement = new Map<string, number>();
  for (const receipt of receipts) {
    receiptsByRequirement.set(receipt.requirementId, (receiptsByRequirement.get(receipt.requirementId) ?? 0) + 1);
  }

  return {
    users,
    targets: {
      FILE: files.map((file) => ({ id: file.id, title: file.fileName, detail: file.workspace.name })),
      ANNOUNCEMENT: announcements.map((announcement) => ({ id: announcement.id, title: announcement.title, detail: announcement.workspace.name })),
      POLICY: policies.map((policy) => ({ id: policy.id, title: policy.title, detail: policy.workspaceId ? "Workspace policy" : "Organization policy" })),
      OFFICIAL_LETTER: letters.map((letter) => ({ id: letter.id, title: letter.title, detail: letter.recipientName })),
      MONTHLY_REPORT: reports.map((report) => ({ id: report.id, title: report.title, detail: `${report.month}/${report.year}` }))
    },
    requirements: requirements.map((requirement) => {
      const audience = jsonArray(requirement.audienceUserIds);
      const confirmed = receiptsByRequirement.get(requirement.id) ?? 0;
      return {
        id: requirement.id,
        targetType: requirement.targetType,
        targetId: requirement.targetId,
        title: requirement.title,
        audienceLabel: requirement.audienceLabel,
        audienceCount: audience.length,
        confirmedCount: confirmed,
        outstandingCount: Math.max(0, audience.length - confirmed),
        dueAt: requirement.dueAt?.toISOString() ?? null,
        active: requirement.active,
        createdAt: requirement.createdAt.toISOString()
      };
    })
  };
}

export async function createReadRequirement(actorId: string, input: {
  targetType: ReadRequirementTargetType;
  targetId: string;
  audienceMode: AudienceMode;
  userIds?: string[];
  instructions?: string | null;
  dueAt?: Date | null;
}) {
  const target = await resolveReadTarget(input.targetType, input.targetId);
  const audience = await resolveAudience({ target, audienceMode: input.audienceMode, userIds: input.userIds });
  const audienceUserIds = unique(audience.userIds);

  if (!audienceUserIds.length) {
    throw new ApiError(422, "No active LETW members were found for this read requirement.");
  }

  const requirement = await prisma.documentReadRequirement.upsert({
    where: { targetType_targetId: { targetType: target.targetType, targetId: target.targetId } },
    create: {
      targetType: target.targetType,
      targetId: target.targetId,
      workspaceId: target.workspaceId,
      title: target.title,
      instructions: input.instructions || null,
      audienceLabel: audience.label,
      audienceUserIds,
      dueAt: input.dueAt ?? null,
      requiredById: actorId
    },
    update: {
      workspaceId: target.workspaceId,
      title: target.title,
      instructions: input.instructions || null,
      audienceLabel: audience.label,
      audienceUserIds,
      dueAt: input.dueAt ?? null,
      active: true,
      requiredById: actorId
    }
  });

  await notifyUsers(audienceUserIds, {
    workspaceId: target.workspaceId ?? undefined,
    type: "SYSTEM_ALERT",
    title: `Read confirmation required: ${target.title}`,
    body: input.instructions || "Please open the document and confirm that you have read it.",
    href: "/dashboard",
    priority: NotificationPriority.HIGH
  }).catch(() => null);

  await logActivity({
    userId: actorId,
    workspaceId: target.workspaceId ?? undefined,
    action: activityActions.readRequirementCreated,
    targetId: requirement.id,
    metadata: { targetType: target.targetType, targetId: target.targetId, audienceCount: audienceUserIds.length }
  });

  return requirement;
}

export async function deactivateReadRequirement(actorId: string, id: string) {
  const requirement = await prisma.documentReadRequirement.update({
    where: { id },
    data: { active: false }
  });
  await logActivity({
    userId: actorId,
    workspaceId: requirement.workspaceId ?? undefined,
    action: activityActions.readRequirementUpdated,
    targetId: id,
    metadata: { active: false }
  });
  return requirement;
}

export async function listOutstandingReadConfirmations(userId: string) {
  const [requirements, receipts] = await Promise.all([
    prisma.documentReadRequirement.findMany({
      where: { active: true },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      take: 500
    }),
    prisma.documentReadReceipt.findMany({
      where: { userId },
      select: { requirementId: true, confirmedAt: true }
    })
  ]);
  const confirmedIds = new Set(receipts.map((receipt) => receipt.requirementId));

  return requirements
    .filter((requirement) => jsonArray(requirement.audienceUserIds).includes(userId) && !confirmedIds.has(requirement.id))
    .map((requirement) => ({
      id: requirement.id,
      targetType: requirement.targetType,
      targetId: requirement.targetId,
      workspaceId: requirement.workspaceId,
      title: requirement.title,
      instructions: requirement.instructions,
      dueAt: requirement.dueAt?.toISOString() ?? null,
      createdAt: requirement.createdAt.toISOString(),
      href:
        requirement.targetType === ReadRequirementTargetType.FILE
          ? `/api/files/${requirement.targetId}/preview`
          : requirement.targetType === ReadRequirementTargetType.POLICY
            ? "/dashboard/operations?tab=policies"
            : requirement.targetType === ReadRequirementTargetType.ANNOUNCEMENT && requirement.workspaceId
              ? `/dashboard/workspaces/${requirement.workspaceId}`
              : requirement.targetType === ReadRequirementTargetType.OFFICIAL_LETTER
                ? `/api/leadership-governance/letters/${requirement.targetId}/pdf`
                : requirement.targetType === ReadRequirementTargetType.MONTHLY_REPORT
                  ? `/api/leadership-governance/reports/${requirement.targetId}/pdf`
                  : "/dashboard"
    }));
}

export async function confirmReadRequirement(userId: string, input: {
  requirementId: string;
  signatureName: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  const requirement = await prisma.documentReadRequirement.findUnique({ where: { id: input.requirementId } });
  if (!requirement || !requirement.active) throw new ApiError(404, "Read requirement not found.");
  if (!jsonArray(requirement.audienceUserIds).includes(userId)) {
    throw new ApiError(403, "This read confirmation is not assigned to your account.");
  }

  const receipt = await prisma.documentReadReceipt.upsert({
    where: { requirementId_userId: { requirementId: requirement.id, userId } },
    create: {
      requirementId: requirement.id,
      userId,
      signatureName: input.signatureName,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null
    },
    update: {
      signatureName: input.signatureName,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      confirmedAt: new Date()
    }
  });

  await createNotification({
    userId: requirement.requiredById,
    workspaceId: requirement.workspaceId ?? undefined,
    type: "SYSTEM_ALERT",
    title: "Read confirmation completed",
    body: requirement.title,
    href: "/dashboard/admin/read-confirmations",
    priority: NotificationPriority.NORMAL
  }).catch(() => null);

  await logActivity({
    userId,
    workspaceId: requirement.workspaceId ?? undefined,
    action: activityActions.readRequirementConfirmed,
    targetId: requirement.id,
    metadata: { targetType: requirement.targetType, targetId: requirement.targetId }
  });

  return receipt;
}
