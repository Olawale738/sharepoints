import { ComplianceAssignmentStatus, DocumentExpiryStatus, MonthlyReportStatus } from "@prisma/client";
import { z } from "zod";

import { logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { getSmartPermissionReviewSnapshot } from "@/lib/admin-command-center";
import { prisma } from "@/lib/prisma";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

const searchSchema = z.object({
  query: z.string().trim().min(3).max(300)
});

const stopWords = new Set([
  "show",
  "all",
  "find",
  "who",
  "has",
  "have",
  "not",
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "are",
  "is",
  "reports",
  "report",
  "documents",
  "document",
  "forms",
  "form",
  "pending",
  "expired",
  "submitted",
  "required"
]);

function queryWords(query: string) {
  return query
    .toLowerCase()
    .split(/[^a-z0-9@.]+/i)
    .map((word) => word.trim())
    .filter((word) => word.length >= 3 && !stopWords.has(word))
    .slice(0, 6);
}

function containsAny(query: string, words: string[]) {
  const normalized = query.toLowerCase();
  return words.some((word) => normalized.includes(word));
}

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id, "Only administrators can use global search intelligence.");

    const parsed = searchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      throw new ApiError(422, "Ask a clear search intelligence question.");
    }

    const query = parsed.data.query;
    const words = queryWords(query);
    const now = new Date();
    const results: Array<Record<string, string | number | null>> = [];
    let answer = "I searched the authorized admin scope and prepared the most relevant operating records.";

    if (containsAny(query, ["expired", "expiry", "review due"]) && containsAny(query, ["document", "file", "policy", "certificate"])) {
      const [expiryItems, files, certificates] = await Promise.all([
        prisma.documentExpiryItem.findMany({
          where: {
            OR: [{ status: DocumentExpiryStatus.EXPIRED }, { reviewDueAt: { lte: now } }, { expiresAt: { lte: now } }]
          },
          orderBy: [{ status: "asc" }, { expiresAt: "asc" }],
          take: 25
        }),
        prisma.file.findMany({
          where: { deletedAt: null, retentionUntil: { lt: now } },
          select: { id: true, fileName: true, retentionUntil: true, workspace: { select: { name: true } } },
          orderBy: { retentionUntil: "asc" },
          take: 25
        }),
        prisma.memberCertificationBadge.findMany({
          where: { expiresAt: { lt: now } },
          select: { id: true, title: true, certificateNumber: true, expiresAt: true, status: true },
          orderBy: { expiresAt: "asc" },
          take: 25
        })
      ]);

      results.push(
        ...expiryItems.map((item) => ({
          type: "lifecycle",
          id: item.id,
          title: item.title,
          status: item.status,
          date: item.expiresAt?.toISOString().slice(0, 10) ?? item.reviewDueAt?.toISOString().slice(0, 10) ?? null
        })),
        ...files.map((file) => ({
          type: "file",
          id: file.id,
          title: file.fileName,
          status: "retention expired",
          workspace: file.workspace.name,
          date: file.retentionUntil?.toISOString().slice(0, 10) ?? null
        })),
        ...certificates.map((certificate) => ({
          type: "certificate",
          id: certificate.id,
          title: certificate.title,
          status: certificate.status,
          certificateNumber: certificate.certificateNumber ?? null,
          date: certificate.expiresAt?.toISOString().slice(0, 10) ?? null
        }))
      );
      answer = `Found ${results.length} expired or review-due document records.`;
    } else if (containsAny(query, ["pending", "draft", "unfinished"]) && containsAny(query, ["report", "reports"])) {
      const filters = words.length
        ? {
            OR: [
              ...words.map((word) => ({ title: { contains: word, mode: "insensitive" as const } })),
              ...words.map((word) => ({ summary: { contains: word, mode: "insensitive" as const } }))
            ]
          }
        : {};
      const reports = await prisma.monthlyMinistryReport.findMany({
        where: {
          status: { in: [MonthlyReportStatus.DRAFT, MonthlyReportStatus.GENERATED] },
          ...filters
        },
        orderBy: [{ year: "desc" }, { month: "desc" }],
        take: 40
      });

      results.push(
        ...reports.map((report) => ({
          type: "monthly report",
          id: report.id,
          title: report.title,
          status: report.status,
          month: report.month,
          year: report.year
        }))
      );
      answer = `Found ${reports.length} pending or not-final monthly report(s).`;
    } else if (containsAny(query, ["form", "forms", "submitted", "submission"]) && containsAny(query, ["not", "missing", "pending", "failed"])) {
      const assignments = await prisma.memberComplianceAssignment.findMany({
        where: {
          status: {
            in: [
              ComplianceAssignmentStatus.PENDING,
              ComplianceAssignmentStatus.CHANGES_REQUESTED,
              ComplianceAssignmentStatus.SANCTIONED
            ]
          }
        },
        include: {
          user: { select: { name: true, email: true } },
          campaign: { select: { title: true, dueAt: true } }
        },
        orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
        take: 40
      });

      results.push(
        ...assignments.map((assignment) => ({
          type: "required form",
          id: assignment.id,
          title: assignment.campaign.title,
          status: assignment.status,
          member: assignment.user.name ?? assignment.user.email ?? "LETW member",
          dueAt: assignment.campaign.dueAt?.toISOString().slice(0, 10) ?? null
        }))
      );
      answer = `Found ${assignments.length} required form assignment(s) needing attention.`;
    } else if (containsAny(query, ["permission", "access", "share", "leader", "transferred"])) {
      const snapshot = await getSmartPermissionReviewSnapshot();
      const suggestions = [
        ...snapshot.oldUnusedMemberships,
        ...snapshot.transferredLeaderSuggestions,
        ...snapshot.expiringAccessSuggestions
      ].slice(0, 40);
      results.push(
        ...suggestions.map((suggestion) => ({
          type: suggestion.kind,
          id: suggestion.id,
          title: suggestion.title,
          status: suggestion.severity,
          detail: suggestion.detail
        }))
      );
      answer = `Found ${results.length} permission review suggestion(s).`;
    } else {
      const [approvals, failedNotifications, lifecycleItems] = await Promise.all([
        prisma.presidentialApprovalItem.findMany({
          where: { status: "PENDING" },
          orderBy: { createdAt: "asc" },
          take: 15
        }),
        prisma.notificationDeliveryEvent.findMany({
          where: { status: { in: ["FAILED", "BLOCKED"] } },
          orderBy: { createdAt: "desc" },
          take: 15
        }),
        prisma.documentExpiryItem.findMany({
          where: { status: { in: [DocumentExpiryStatus.REVIEW_DUE, DocumentExpiryStatus.EXPIRED] } },
          orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
          take: 15
        })
      ]);

      results.push(
        ...approvals.map((item) => ({ type: "approval", id: item.id, title: item.title, status: item.status })),
        ...failedNotifications.map((item) => ({ type: "notification", id: item.id, title: item.channel, status: item.status })),
        ...lifecycleItems.map((item) => ({ type: "lifecycle", id: item.id, title: item.title, status: item.status }))
      );
      answer = `Found ${results.length} urgent operating record(s) across approvals, notifications, and document lifecycle.`;
    }

    await logActivity({
      userId: user.id,
      action: "search_intelligence.asked",
      metadata: { source: "search_intelligence", query, resultCount: results.length }
    });

    return ok({ answer, results: results.slice(0, 60), generatedAt: new Date().toISOString() });
  } catch (error) {
    return handleRouteError(error);
  }
}
