import { randomUUID } from "node:crypto";

import { z } from "zod";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import {
  cardCsvRow,
  cardStatusTone,
  ensureMemberNumber,
  issueOrReissueCard,
  logQrBulkAction,
  markCardLost,
  refreshOfflinePayload,
  renewCard,
  rotateCardQr
} from "@/lib/qr-identity";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

export const runtime = "nodejs";

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("BULK_GENERATE_MEMBER_NUMBERS"),
    userIds: z.array(z.string().cuid()).optional(),
    onlyMissing: z.boolean().default(true)
  }),
  z.object({
    action: z.literal("BULK_ISSUE_IDS"),
    userIds: z.array(z.string().cuid()).optional(),
    onlyMissing: z.boolean().default(true),
    expiresAt: z.string().datetime().nullable().optional()
  }),
  z.object({
    action: z.literal("BULK_REISSUE_IDS"),
    userIds: z.array(z.string().cuid()).min(1),
    expiresAt: z.string().datetime().nullable().optional()
  }),
  z.object({
    action: z.literal("MARK_LOST"),
    cardId: z.string().cuid(),
    reason: z.string().trim().max(500).nullable().optional()
  }),
  z.object({
    action: z.literal("RENEW_CARD"),
    cardId: z.string().cuid(),
    expiresAt: z.string().datetime().nullable().optional(),
    rotateQr: z.boolean().default(false)
  }),
  z.object({
    action: z.literal("ROTATE_QR"),
    cardId: z.string().cuid(),
    reason: z.string().trim().max(500).nullable().optional()
  }),
  z.object({
    action: z.literal("CREATE_VISITOR_PASS"),
    displayName: z.string().trim().min(2).max(160),
    email: z.string().email().nullable().optional(),
    phone: z.string().trim().max(60).nullable().optional(),
    purpose: z.string().trim().min(2).max(240),
    accessPointId: z.string().cuid().nullable().optional(),
    organizationUnitId: z.string().cuid().nullable().optional(),
    validFrom: z.string().datetime().nullable().optional(),
    validUntil: z.string().datetime()
  }),
  z.object({
    action: z.literal("REVOKE_VISITOR_PASS"),
    id: z.string().cuid()
  }),
  z.object({
    action: z.literal("CREATE_HOUSEHOLD_LINK"),
    primaryUserId: z.string().cuid(),
    relatedUserId: z.string().cuid().nullable().optional(),
    displayName: z.string().trim().min(2).max(160),
    relationship: z.string().trim().min(2).max(80)
  }),
  z.object({
    action: z.literal("CREATE_ONBOARDING_ITEM"),
    userId: z.string().cuid(),
    title: z.string().trim().min(2).max(160),
    description: z.string().trim().max(1000).nullable().optional(),
    dueAt: z.string().datetime().nullable().optional()
  }),
  z.object({
    action: z.literal("COMPLETE_ONBOARDING_ITEM"),
    id: z.string().cuid()
  }),
  z.object({
    action: z.literal("CREATE_CERTIFICATION_BADGE"),
    userId: z.string().cuid(),
    title: z.string().trim().min(2).max(160),
    issuer: z.string().trim().max(160).nullable().optional(),
    certificateNumber: z.string().trim().max(120).nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional()
  }),
  z.object({
    action: z.literal("APPROVE_HIGH_SECURITY"),
    accessPointId: z.string().cuid(),
    userId: z.string().cuid(),
    reason: z.string().trim().max(500).nullable().optional(),
    validUntil: z.string().datetime().nullable().optional()
  }),
  z.object({
    action: z.literal("REVOKE_HIGH_SECURITY_APPROVAL"),
    id: z.string().cuid()
  }),
  z.object({
    action: z.literal("CLEAR_QR_LOGS"),
    confirmation: z.literal("CLEAR QR LOGS")
  })
]);

async function activeUsers(userIds?: string[]) {
  return prisma.user.findMany({
    where: {
      deletedAt: null,
      suspendedAt: null,
      accessRevokedAt: null,
      ...(userIds?.length ? { id: { in: userIds } } : {})
    },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      category: true,
      departmentId: true,
      memberProfile: true
    },
    orderBy: [{ name: "asc" }, { email: "asc" }],
    take: 5000
  });
}

async function cardsDashboard() {
  const [
    cards,
    users,
    departments,
    accessPoints,
    visitorPasses,
    householdLinks,
    onboardingItems,
    badges,
    approvals,
    accessLogs,
    verifications,
    bulkLogs,
    branchTransfers
  ] = await Promise.all([
    prisma.digitalMembershipCard.findMany({ where: { deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 1000 }),
    prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        category: true,
        departmentId: true,
        memberProfile: true,
        workspaceMemberships: { select: { role: true, workspace: { select: { name: true } } } }
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      take: 1000
    }),
    prisma.department.findMany({ select: { id: true, name: true, kind: true } }),
    prisma.accessPoint.findMany({ orderBy: { name: "asc" }, take: 300 }),
    prisma.temporaryVisitorPass.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.membershipHouseholdLink.findMany({ orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.memberOnboardingItem.findMany({ orderBy: [{ status: "asc" }, { dueAt: "asc" }], take: 500 }),
    prisma.memberCertificationBadge.findMany({ orderBy: { issuedAt: "desc" }, take: 500 }),
    prisma.digitalIdAccessApproval.findMany({ orderBy: { createdAt: "desc" }, take: 300 }),
    prisma.accessScanLog.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.digitalIdentityVerification.findMany({ orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.qrBulkActionLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.branchTransferRequest.findMany({ orderBy: { createdAt: "desc" }, take: 200 })
  ]);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const cardsByUserId = new Map(cards.map((card) => [card.userId, card]));
  const cardRows = users.map((user) => {
    const card = cardsByUserId.get(user.id) ?? null;
    return {
      user,
      card,
      statusTone: card ? cardStatusTone(card) : "MISSING",
      missingPhoto: !user.image,
      missingMemberNumber: !user.memberProfile?.membershipNumber,
      badges: badges.filter((badge) => badge.userId === user.id),
      onboarding: onboardingItems.filter((item) => item.userId === user.id),
      household: householdLinks.filter((link) => link.primaryUserId === user.id || link.relatedUserId === user.id),
      branchTransfers: branchTransfers.filter((transfer) => transfer.userId === user.id)
    };
  });
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const latestGrantedByUser = new Map<string, (typeof accessLogs)[number]>();
  for (const log of accessLogs) {
    if (log.decision !== "GRANTED" || !log.scannedUserId || log.createdAt < today) continue;
    if (!latestGrantedByUser.has(log.scannedUserId)) latestGrantedByUser.set(log.scannedUserId, log);
  }

  return {
    cards: cardRows,
    users,
    departments,
    accessPoints,
    visitorPasses,
    householdLinks,
    onboardingItems,
    badges,
    approvals,
    accessLogs,
    verifications,
    bulkLogs,
    liveInside: Array.from(latestGrantedByUser.values()).map((log) => ({
      log,
      user: usersById.get(log.scannedUserId ?? "")
    })),
    stats: {
      users: users.length,
      cards: cards.length,
      activeCards: cardRows.filter((row) => row.statusTone === "ACTIVE").length,
      expiredCards: cardRows.filter((row) => row.statusTone === "EXPIRED").length,
      revokedCards: cardRows.filter((row) => row.statusTone === "REVOKED").length,
      lostCards: cardRows.filter((row) => row.statusTone === "LOST").length,
      missingCards: cardRows.filter((row) => row.statusTone === "MISSING").length,
      missingPhoto: cardRows.filter((row) => row.missingPhoto).length,
      missingMemberNumber: cardRows.filter((row) => row.missingMemberNumber).length,
      suspiciousScans: accessLogs.filter((log) => log.suspicious).length,
      visitorsActive: visitorPasses.filter((pass) => pass.status === "ACTIVE" && pass.validUntil >= now && !pass.revokedAt).length,
      liveInside: latestGrantedByUser.size
    }
  };
}

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id, "Only administrators can manage QR identity.");
    const url = new URL(request.url);
    const dashboard = await cardsDashboard();

    if (url.searchParams.get("export") === "cards") {
      const rows = [
        cardCsvRow([
          "Name",
          "Email",
          "Organization ID",
          "Card number",
          "Membership number",
          "Status",
          "Position",
          "Department/category",
          "Location",
          "Issued",
          "Expires",
          "QR rotations",
          "Photo"
        ]),
        ...dashboard.cards.map((row) =>
          cardCsvRow([
            row.user.name,
            row.user.email,
            row.card?.organizationId,
            row.card?.cardNumber,
            row.user.memberProfile?.membershipNumber,
            row.statusTone,
            row.user.memberProfile?.organizationPosition,
            row.user.category,
            row.user.memberProfile?.digitalIdLocation,
            row.card?.issuedAt.toISOString(),
            row.card?.expiresAt?.toISOString(),
            row.card?.qrRotationCount,
            row.user.image ? "YES" : "NO"
          ])
        )
      ].join("\n");
      return new Response(rows, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": 'attachment; filename="letw-digital-id-cards.csv"'
        }
      });
    }

    return ok(dashboard);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    await requireAnyWorkspaceAdmin(actor.id, "Only administrators can manage QR identity.");
    const parsed = actionSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid QR identity request.");
    const data = parsed.data;
    let result: unknown = null;
    let activityAction: string | null = null;
    let targetId: string | undefined;

    if (data.action === "BULK_GENERATE_MEMBER_NUMBERS") {
      const users = await activeUsers(data.userIds);
      const selected = data.onlyMissing
        ? users.filter((member) => !member.memberProfile?.membershipNumber?.trim())
        : users;
      for (const member of selected) await ensureMemberNumber(member.id);
      await logQrBulkAction({
        actorId: actor.id,
        action: data.action,
        count: selected.length,
        metadata: { onlyMissing: data.onlyMissing }
      });
      result = { count: selected.length };
    } else if (data.action === "BULK_ISSUE_IDS" || data.action === "BULK_REISSUE_IDS") {
      const users = await activeUsers(data.userIds);
      const existingCards = await prisma.digitalMembershipCard.findMany({
        where: { userId: { in: users.map((member) => member.id) }, deletedAt: null },
        select: { userId: true }
      });
      const existingUserIds = new Set(existingCards.map((card) => card.userId));
      const selected =
        data.action === "BULK_ISSUE_IDS" && data.onlyMissing
          ? users.filter((member) => !existingUserIds.has(member.id))
          : users;
      for (const member of selected) {
        await issueOrReissueCard({
          userId: member.id,
          actorId: actor.id,
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null
        });
      }
      await logQrBulkAction({
        actorId: actor.id,
        action: data.action,
        count: selected.length,
        metadata: { onlyMissing: "onlyMissing" in data ? data.onlyMissing : false }
      });
      result = { count: selected.length };
    } else if (data.action === "MARK_LOST") {
      result = await markCardLost({ cardId: data.cardId, actorId: actor.id, reason: data.reason });
      targetId = data.cardId;
    } else if (data.action === "RENEW_CARD") {
      result = await renewCard({
        cardId: data.cardId,
        actorId: actor.id,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        rotateQr: data.rotateQr
      });
      targetId = data.cardId;
    } else if (data.action === "ROTATE_QR") {
      result = await rotateCardQr({ cardId: data.cardId, actorId: actor.id, reason: data.reason });
      targetId = data.cardId;
    } else if (data.action === "CREATE_VISITOR_PASS") {
      result = await prisma.temporaryVisitorPass.create({
        data: {
          displayName: data.displayName,
          email: data.email ?? null,
          phone: data.phone ?? null,
          purpose: data.purpose,
          qrToken: randomUUID(),
          accessPointId: data.accessPointId ?? null,
          organizationUnitId: data.organizationUnitId ?? null,
          validFrom: data.validFrom ? new Date(data.validFrom) : new Date(),
          validUntil: new Date(data.validUntil),
          issuedById: actor.id
        }
      });
      activityAction = activityActions.visitorPassCreated;
      targetId = (result as { id: string }).id;
    } else if (data.action === "REVOKE_VISITOR_PASS") {
      result = await prisma.temporaryVisitorPass.update({
        where: { id: data.id },
        data: { status: "REVOKED", revokedAt: new Date(), revokedById: actor.id }
      });
      activityAction = activityActions.visitorPassRevoked;
      targetId = data.id;
    } else if (data.action === "CREATE_HOUSEHOLD_LINK") {
      result = await prisma.membershipHouseholdLink.create({
        data: {
          primaryUserId: data.primaryUserId,
          relatedUserId: data.relatedUserId ?? null,
          displayName: data.displayName,
          relationship: data.relationship,
          createdById: actor.id
        }
      });
      activityAction = activityActions.householdLinkCreated;
      targetId = (result as { id: string }).id;
    } else if (data.action === "CREATE_ONBOARDING_ITEM") {
      result = await prisma.memberOnboardingItem.upsert({
        where: {
          userId_title: {
            userId: data.userId,
            title: data.title
          }
        },
        update: {
          description: data.description ?? null,
          dueAt: data.dueAt ? new Date(data.dueAt) : null,
          status: "PENDING",
          completedAt: null,
          completedById: null
        },
        create: {
          userId: data.userId,
          title: data.title,
          description: data.description ?? null,
          dueAt: data.dueAt ? new Date(data.dueAt) : null,
          createdById: actor.id
        }
      });
      activityAction = activityActions.onboardingItemCreated;
      targetId = (result as { id: string }).id;
    } else if (data.action === "COMPLETE_ONBOARDING_ITEM") {
      result = await prisma.memberOnboardingItem.update({
        where: { id: data.id },
        data: { status: "COMPLETED", completedAt: new Date(), completedById: actor.id }
      });
      activityAction = activityActions.onboardingItemCompleted;
      targetId = data.id;
    } else if (data.action === "CREATE_CERTIFICATION_BADGE") {
      result = await prisma.memberCertificationBadge.create({
        data: {
          userId: data.userId,
          title: data.title,
          issuer: data.issuer || "Light Encounter Tabernacle Worldwide",
          certificateNumber: data.certificateNumber || `LETW-CERT-${randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase()}`,
          verifyToken: randomUUID(),
          expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
          createdById: actor.id
        }
      });
      activityAction = activityActions.certificationBadgeCreated;
      targetId = (result as { id: string }).id;
    } else if (data.action === "APPROVE_HIGH_SECURITY") {
      result = await prisma.digitalIdAccessApproval.upsert({
        where: {
          accessPointId_userId: {
            accessPointId: data.accessPointId,
            userId: data.userId
          }
        },
        update: {
          reason: data.reason ?? null,
          validFrom: new Date(),
          validUntil: data.validUntil ? new Date(data.validUntil) : null,
          revokedAt: null,
          revokedById: null,
          approvedById: actor.id
        },
        create: {
          accessPointId: data.accessPointId,
          userId: data.userId,
          reason: data.reason ?? null,
          validUntil: data.validUntil ? new Date(data.validUntil) : null,
          approvedById: actor.id
        }
      });
      activityAction = activityActions.highSecurityAccessApproved;
      targetId = (result as { id: string }).id;
    } else if (data.action === "REVOKE_HIGH_SECURITY_APPROVAL") {
      result = await prisma.digitalIdAccessApproval.update({
        where: { id: data.id },
        data: { revokedAt: new Date(), revokedById: actor.id }
      });
      activityAction = activityActions.highSecurityAccessRevoked;
      targetId = data.id;
    } else if (data.action === "CLEAR_QR_LOGS") {
      const [access, verification] = await prisma.$transaction([
        prisma.accessScanLog.deleteMany({}),
        prisma.digitalIdentityVerification.deleteMany({})
      ]);
      result = { accessLogs: access.count, verificationLogs: verification.count };
      activityAction = activityActions.membershipVerificationLogsCleared;
    }

    if (activityAction) {
      await logActivity({
        userId: actor.id,
        action: activityAction,
        targetId,
        metadata: { action: data.action }
      });
    }

    if (targetId && ["MARK_LOST", "RENEW_CARD", "ROTATE_QR"].includes(data.action)) {
      await refreshOfflinePayload(targetId).catch(() => null);
    }

    return ok({ result }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
