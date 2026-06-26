import { randomUUID } from "crypto";
import { z } from "zod";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { localeEnglishName, supportedLocales } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

const jsonList = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .nullable()
  .transform((value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value.map((item) => item.trim()).filter(Boolean);
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  });

const requestSchema = z.discriminatedUnion("entity", [
  z.object({
    entity: z.literal("VOLUNTEER_OPPORTUNITY"),
    title: z.string().trim().min(2).max(180),
    role: z.string().trim().min(2).max(120),
    ministryId: z.string().cuid().nullable().optional(),
    organizationUnitId: z.string().cuid().nullable().optional(),
    workspaceId: z.string().cuid().nullable().optional(),
    location: z.string().trim().max(160).nullable().optional(),
    requiredSkills: jsonList,
    spiritualGifts: jsonList,
    languages: jsonList,
    interests: jsonList
  }),
  z.object({
    entity: z.literal("GENERATE_MATCHES"),
    opportunityId: z.string().cuid()
  }),
  z.object({
    entity: z.literal("BRANCH_PLAYBOOK"),
    name: z.string().trim().min(2).max(180),
    country: z.string().trim().max(80).nullable().optional(),
    city: z.string().trim().max(100).nullable().optional(),
    organizationUnitId: z.string().cuid().nullable().optional(),
    leaderId: z.string().cuid().nullable().optional(),
    targetLaunchAt: z.string().datetime().nullable().optional(),
    budgetAmount: z.coerce.number().int().min(0).nullable().optional(),
    budgetCurrency: z.string().trim().min(3).max(3).default("GBP")
  }),
  z.object({
    entity: z.literal("TRANSLATION"),
    sourceType: z.enum(["ANNOUNCEMENT", "SERMON", "CHAT", "POLICY", "TRAINING", "DOCUMENT", "OTHER"]),
    sourceId: z.string().trim().max(100).nullable().optional(),
    title: z.string().trim().min(2).max(180),
    sourceLanguage: z.enum(supportedLocales).default("en"),
    targetLanguage: z.enum(supportedLocales),
    originalText: z.string().trim().min(1).max(20_000)
  }),
  z.object({
    entity: z.literal("MARKETPLACE_LISTING"),
    resourceId: z.string().cuid().nullable().optional(),
    organizationUnitId: z.string().cuid().nullable().optional(),
    title: z.string().trim().min(2).max(180),
    category: z.string().trim().min(2).max(80),
    description: z.string().trim().max(1000).nullable().optional(),
    quantity: z.coerce.number().int().min(1).default(1),
    location: z.string().trim().max(160).nullable().optional(),
    availableFrom: z.string().datetime().nullable().optional()
  }),
  z.object({
    entity: z.literal("MARKETPLACE_REQUEST"),
    listingId: z.string().cuid().nullable().optional(),
    organizationUnitId: z.string().cuid().nullable().optional(),
    title: z.string().trim().min(2).max(180),
    category: z.string().trim().min(2).max(80),
    quantity: z.coerce.number().int().min(1).default(1),
    neededBy: z.string().datetime().nullable().optional(),
    notes: z.string().trim().max(1000).nullable().optional()
  }),
  z.object({
    entity: z.literal("ROSTER_PLAN"),
    title: z.string().trim().min(2).max(180),
    ministryId: z.string().cuid().nullable().optional(),
    organizationUnitId: z.string().cuid().nullable().optional(),
    workspaceId: z.string().cuid().nullable().optional(),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
    roles: jsonList
  }),
  z.object({
    entity: z.literal("GENERATE_LEADERSHIP"),
    organizationUnitId: z.string().cuid().nullable().optional(),
    ministryId: z.string().cuid().nullable().optional()
  })
]);

const updateSchema = z.discriminatedUnion("entity", [
  z.object({ entity: z.literal("BRANCH_STEP"), id: z.string().cuid(), status: z.enum(["NOT_STARTED", "IN_PROGRESS", "DONE", "BLOCKED"]) }),
  z.object({ entity: z.literal("ROSTER_PLAN"), id: z.string().cuid(), status: z.enum(["DRAFT", "GENERATED", "PUBLISHED", "ARCHIVED"]) }),
  z.object({ entity: z.literal("LEADERSHIP_CANDIDATE"), id: z.string().cuid(), status: z.enum(["WATCHLIST", "TRAINING", "READY", "APPOINTED", "NOT_READY"]) }),
  z.object({ entity: z.literal("MARKETPLACE_LISTING"), id: z.string().cuid(), status: z.enum(["AVAILABLE", "REQUESTED", "RESERVED", "SHARED", "ARCHIVED"]) }),
  z.object({ entity: z.literal("MARKETPLACE_REQUEST"), id: z.string().cuid(), status: z.enum(["OPEN", "OFFERED", "FULFILLED", "CANCELLED"]) })
]);

const defaultLaunchSteps = [
  ["Venue", "Secure venue or meeting place"],
  ["Workers", "Assign launch workers and department leads"],
  ["Equipment", "Prepare instruments, chairs, media, sound and transport"],
  ["Legal", "Upload permits, agreements and required documents"],
  ["Outreach", "Plan invitation, evangelism and follow-up teams"],
  ["Launch service", "Confirm launch service order, sermon, worship and media"],
  ["Follow-up", "Create visitor/new-convert follow-up process after launch"]
];

function listFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).toLowerCase().trim()).filter(Boolean);
}

function overlap(a: string[], b: string[]) {
  const right = new Set(b);
  return a.filter((item) => right.has(item));
}

async function generateVolunteerMatches(opportunityId: string) {
  const opportunity = await prisma.volunteerOpportunity.findUnique({ where: { id: opportunityId } });
  if (!opportunity) throw new ApiError(404, "Volunteer opportunity not found.");
  const [users, availability] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null, suspendedAt: null, accessRevokedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        locale: true,
        memberProfile: {
          select: {
            skills: true,
            ministryInterests: true,
            city: true,
            country: true,
            membershipStatus: true,
            currentOrganizationUnitId: true,
            organizationPosition: true
          }
        }
      }
    }),
    prisma.staffAvailability.findMany({ where: { status: "AVAILABLE" }, select: { userId: true } })
  ]);
  const availableUserIds = new Set(availability.map((item) => item.userId));
  const requiredSkills = listFromJson(opportunity.requiredSkills);
  const interests = listFromJson(opportunity.interests);
  const gifts = listFromJson(opportunity.spiritualGifts);
  const languages = listFromJson(opportunity.languages);

  const scored = users.map((candidate) => {
    const profile = candidate.memberProfile;
    const candidateSkills = listFromJson(profile?.skills);
    const candidateInterests = listFromJson(profile?.ministryInterests);
    const skillMatches = overlap(requiredSkills, candidateSkills);
    const interestMatches = overlap(interests, candidateInterests);
    const languageMatches = languages.includes(candidate.locale.toLowerCase()) ? [candidate.locale] : [];
    let score = 20;
    score += skillMatches.length * 15;
    score += interestMatches.length * 10;
    score += gifts.length && candidateInterests.length ? 5 : 0;
    score += languageMatches.length * 10;
    score += availableUserIds.has(candidate.id) ? 15 : 0;
    score += opportunity.organizationUnitId && profile?.currentOrganizationUnitId === opportunity.organizationUnitId ? 15 : 0;
    score += profile?.membershipStatus === "ACTIVE" ? 10 : 0;
    const reasons = [
      ...skillMatches.map((item) => `skill:${item}`),
      ...interestMatches.map((item) => `interest:${item}`),
      ...languageMatches.map((item) => `language:${item}`),
      ...(availableUserIds.has(candidate.id) ? ["available"] : []),
      ...(opportunity.organizationUnitId && profile?.currentOrganizationUnitId === opportunity.organizationUnitId ? ["same branch"] : [])
    ];
    return { userId: candidate.id, score: Math.min(100, score), reasons };
  }).filter((item) => item.score >= 25).sort((a, b) => b.score - a.score).slice(0, 25);

  await prisma.$transaction(
    scored.map((item) =>
      prisma.volunteerMatch.upsert({
        where: { opportunityId_userId: { opportunityId, userId: item.userId } },
        update: { score: item.score, reasons: item.reasons },
        create: { opportunityId, userId: item.userId, score: item.score, reasons: item.reasons }
      })
    )
  );
  return scored.length;
}

async function translateText(targetLanguage: (typeof supportedLocales)[number], text: string) {
  if (!process.env.OPENAI_API_KEY) throw new ApiError(503, "Translation requires OPENAI_API_KEY.");
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TRANSLATION_MODEL ?? "gpt-5-mini",
      instructions:
        `Translate the user's church collaboration content into ${localeEnglishName(targetLanguage)}. ` +
        "Preserve names, scripture references, formatting, dates, and meaning. Return only the translation.",
      input: text
    })
  });
  const body = (await response.json().catch(() => null)) as { output_text?: string; error?: { message?: string } } | null;
  if (!response.ok || !body) throw new ApiError(502, body?.error?.message ?? "Translation service failed.");
  const translation = body.output_text?.trim();
  if (!translation) throw new ApiError(502, "The translation service returned an empty response.");
  return translation;
}

async function generateLeadershipCandidates(userId: string, organizationUnitId?: string | null, ministryId?: string | null) {
  const [users, attendance, volunteers] = await Promise.all([
    prisma.user.findMany({
      where: { deletedAt: null, suspendedAt: null, accessRevokedAt: null },
      select: {
        id: true,
        category: true,
        workspaceMemberships: { select: { role: true } },
        memberProfile: {
          select: {
            membershipStatus: true,
            skills: true,
            ministryInterests: true,
            currentOrganizationUnitId: true,
            organizationPosition: true
          }
        }
      },
      take: 1000
    }),
    prisma.smartAttendanceRecord.groupBy({ by: ["userId"], where: { userId: { not: null } }, _count: { _all: true } }),
    prisma.volunteerAssignment.groupBy({ by: ["userId"], _count: { _all: true } })
  ]);
  const attendanceByUser = new Map(attendance.map((item) => [item.userId, item._count._all]));
  const volunteerByUser = new Map(volunteers.map((item) => [item.userId, item._count._all]));
  let generated = 0;
  for (const member of users) {
    const profile = member.memberProfile;
    if (organizationUnitId && profile?.currentOrganizationUnitId !== organizationUnitId) continue;
    const skills = listFromJson(profile?.skills);
    const interests = listFromJson(profile?.ministryInterests);
    const score = Math.min(
      100,
      20 +
        (profile?.membershipStatus === "ACTIVE" ? 15 : 0) +
        Math.min(20, (attendanceByUser.get(member.id) ?? 0) * 2) +
        Math.min(20, (volunteerByUser.get(member.id) ?? 0) * 4) +
        Math.min(15, skills.length * 3) +
        (member.workspaceMemberships.some((item) => ["LEADER", "MODERATOR", "ADMIN"].includes(item.role)) ? 10 : 0)
    );
    if (score < 45) continue;
    const existing = await prisma.leadershipCandidate.findFirst({ where: { userId: member.id, organizationUnitId: organizationUnitId ?? null, ministryId: ministryId ?? null } });
    const data = {
      score,
      strengths: [
        ...(attendanceByUser.get(member.id) ? [`attendance:${attendanceByUser.get(member.id)}`] : []),
        ...(volunteerByUser.get(member.id) ? [`service:${volunteerByUser.get(member.id)}`] : []),
        ...skills.slice(0, 6),
        ...interests.slice(0, 6)
      ],
      recommendation: score >= 75 ? "Ready for leadership review." : "Continue training and observe consistency.",
      nominatedById: userId
    };
    if (existing) {
      await prisma.leadershipCandidate.update({ where: { id: existing.id }, data });
    } else {
      await prisma.leadershipCandidate.create({
        data: { userId: member.id, organizationUnitId: organizationUnitId ?? null, ministryId: ministryId ?? null, ...data }
      });
    }
    generated += 1;
  }
  return generated;
}

export async function GET() {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id);
    const [
      opportunities,
      matches,
      launchPlans,
      launchSteps,
      translations,
      marketplaceListings,
      marketplaceRequests,
      rosterPlans,
      rosterAssignments,
      leadershipCandidates,
      users,
      ministries,
      units,
      resources,
      workspaces
    ] = await Promise.all([
      prisma.volunteerOpportunity.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
      prisma.volunteerMatch.findMany({ orderBy: [{ score: "desc" }, { createdAt: "desc" }], take: 500 }),
      prisma.branchLaunchPlan.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 100 }),
      prisma.branchLaunchStep.findMany({ orderBy: [{ planId: "asc" }, { sortOrder: "asc" }] }),
      prisma.translationRecord.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
      prisma.resourceMarketplaceListing.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200 }),
      prisma.resourceMarketplaceRequest.findMany({ orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 200 }),
      prisma.rosterPlan.findMany({ orderBy: { startsAt: "desc" }, take: 100 }),
      prisma.rosterAssignment.findMany({ orderBy: { dutyDate: "desc" }, take: 500 }),
      prisma.leadershipCandidate.findMany({ orderBy: [{ status: "asc" }, { score: "desc" }], take: 300 }),
      prisma.user.findMany({ where: { deletedAt: null, suspendedAt: null, accessRevokedAt: null }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
      prisma.ministry.findMany({ orderBy: { name: "asc" } }),
      prisma.organizationUnit.findMany({ where: { active: true }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
      prisma.churchResource.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
      prisma.workspace.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    ]);
    return ok({
      opportunities,
      matches,
      launchPlans,
      launchSteps,
      translations,
      marketplaceListings,
      marketplaceRequests,
      rosterPlans,
      rosterAssignments,
      leadershipCandidates,
      users,
      ministries,
      units,
      resources,
      workspaces
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id);
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid request.");
    const data = parsed.data;
    let result: unknown;
    let action = "";

    if (data.entity === "VOLUNTEER_OPPORTUNITY") {
      result = await prisma.volunteerOpportunity.create({
        data: {
          title: data.title,
          role: data.role,
          ministryId: data.ministryId ?? null,
          organizationUnitId: data.organizationUnitId ?? null,
          workspaceId: data.workspaceId ?? null,
          location: data.location ?? null,
          requiredSkills: data.requiredSkills,
          spiritualGifts: data.spiritualGifts,
          languages: data.languages,
          interests: data.interests,
          createdById: user.id
        }
      });
      await generateVolunteerMatches((result as { id: string }).id);
      action = activityActions.volunteerOpportunityCreated;
    } else if (data.entity === "GENERATE_MATCHES") {
      result = { count: await generateVolunteerMatches(data.opportunityId) };
      action = activityActions.volunteerMatchesGenerated;
    } else if (data.entity === "BRANCH_PLAYBOOK") {
      result = await prisma.$transaction(async (tx) => {
        const plan = await tx.branchLaunchPlan.create({
          data: {
            name: data.name,
            country: data.country ?? null,
            city: data.city ?? null,
            organizationUnitId: data.organizationUnitId ?? null,
            leaderId: data.leaderId ?? null,
            targetLaunchAt: data.targetLaunchAt ? new Date(data.targetLaunchAt) : null,
            budgetAmount: data.budgetAmount ?? null,
            budgetCurrency: data.budgetCurrency.toUpperCase(),
            createdById: user.id
          }
        });
        await tx.branchLaunchStep.createMany({
          data: defaultLaunchSteps.map(([category, title], index) => ({
            planId: plan.id,
            category,
            title,
            sortOrder: index + 1
          }))
        });
        return plan;
      });
      action = activityActions.branchLaunchPlanCreated;
    } else if (data.entity === "TRANSLATION") {
      const translatedText = await translateText(data.targetLanguage, data.originalText);
      result = await prisma.translationRecord.create({
        data: {
          sourceType: data.sourceType,
          sourceId: data.sourceId ?? null,
          title: data.title,
          sourceLanguage: data.sourceLanguage,
          targetLanguage: data.targetLanguage,
          originalText: data.originalText,
          translatedText,
          createdById: user.id
        }
      });
      action = activityActions.translationRecordCreated;
    } else if (data.entity === "MARKETPLACE_LISTING") {
      result = await prisma.resourceMarketplaceListing.create({
        data: {
          resourceId: data.resourceId ?? null,
          organizationUnitId: data.organizationUnitId ?? null,
          title: data.title,
          category: data.category,
          description: data.description ?? null,
          quantity: data.quantity,
          location: data.location ?? null,
          availableFrom: data.availableFrom ? new Date(data.availableFrom) : null,
          offeredById: user.id
        }
      });
      action = activityActions.marketplaceListingCreated;
    } else if (data.entity === "MARKETPLACE_REQUEST") {
      result = await prisma.resourceMarketplaceRequest.create({
        data: {
          listingId: data.listingId ?? null,
          organizationUnitId: data.organizationUnitId ?? null,
          title: data.title,
          category: data.category,
          quantity: data.quantity,
          neededBy: data.neededBy ? new Date(data.neededBy) : null,
          notes: data.notes ?? null,
          requestedById: user.id
        }
      });
      action = activityActions.marketplaceRequestCreated;
    } else if (data.entity === "ROSTER_PLAN") {
      const roles = data.roles.length ? data.roles : ["Usher", "Media", "Choir", "Protocol"];
      result = await prisma.$transaction(async (tx) => {
        const plan = await tx.rosterPlan.create({
          data: {
            title: data.title,
            ministryId: data.ministryId ?? null,
            organizationUnitId: data.organizationUnitId ?? null,
            workspaceId: data.workspaceId ?? null,
            startsAt: new Date(data.startsAt),
            endsAt: new Date(data.endsAt),
            status: "GENERATED",
            createdById: user.id
          }
        });
        const candidates = await tx.user.findMany({
          where: {
            deletedAt: null,
            suspendedAt: null,
            accessRevokedAt: null,
            ...(data.organizationUnitId ? { memberProfile: { currentOrganizationUnitId: data.organizationUnitId } } : {})
          },
          select: { id: true },
          take: Math.max(roles.length, 1) * 4
        });
        const assignments = roles.map((role, index) => {
          const candidate = candidates[index % Math.max(candidates.length, 1)];
          return candidate
            ? {
                rosterPlanId: plan.id,
                userId: candidate.id,
                role,
                dutyDate: new Date(data.startsAt),
                notes: "Auto-generated by LETW smart rostering"
              }
            : null;
        }).filter((item): item is NonNullable<typeof item> => Boolean(item));
        if (assignments.length) {
          await tx.rosterAssignment.createMany({ data: assignments, skipDuplicates: true });
          await tx.dutySchedule.createMany({
            data: assignments.map((item) => ({
              workspaceId: data.workspaceId ?? null,
              title: `${data.title} - ${item.role}`,
              role: item.role,
              startsAt: new Date(data.startsAt),
              endsAt: new Date(data.endsAt),
              assignedToId: item.userId,
              createdById: user.id,
              notes: item.notes
            }))
          });
        }
        return plan;
      });
      action = activityActions.rosterPlanGenerated;
    } else {
      result = { count: await generateLeadershipCandidates(user.id, data.organizationUnitId, data.ministryId) };
      action = activityActions.leadershipCandidatesGenerated;
    }

    await logActivity({
      userId: user.id,
      action,
      targetId: (result as { id?: string } | null)?.id ?? (data.entity === "GENERATE_MATCHES" ? data.opportunityId : undefined),
      metadata: { entity: data.entity, requestId: randomUUID() }
    });
    return ok({ result }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    await requireAnyWorkspaceAdmin(user.id);
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid update.");
    const data = parsed.data;
    let result: unknown;
    let action = "";
    if (data.entity === "BRANCH_STEP") {
      result = await prisma.branchLaunchStep.update({ where: { id: data.id }, data: { status: data.status } });
      action = activityActions.branchLaunchStepUpdated;
    } else if (data.entity === "ROSTER_PLAN") {
      result = await prisma.rosterPlan.update({ where: { id: data.id }, data: { status: data.status } });
      action = activityActions.rosterPlanUpdated;
    } else if (data.entity === "LEADERSHIP_CANDIDATE") {
      result = await prisma.leadershipCandidate.update({ where: { id: data.id }, data: { status: data.status, reviewedById: user.id, reviewedAt: new Date() } });
      action = activityActions.leadershipCandidateUpdated;
    } else if (data.entity === "MARKETPLACE_LISTING") {
      result = await prisma.resourceMarketplaceListing.update({ where: { id: data.id }, data: { status: data.status } });
      action = activityActions.marketplaceListingCreated;
    } else {
      result = await prisma.resourceMarketplaceRequest.update({ where: { id: data.id }, data: { status: data.status } });
      action = activityActions.marketplaceRequestCreated;
    }
    await logActivity({ userId: user.id, action, targetId: data.id, metadata: { entity: data.entity } });
    return ok({ result });
  } catch (error) {
    return handleRouteError(error);
  }
}
