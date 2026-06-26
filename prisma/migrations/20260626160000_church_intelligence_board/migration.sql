CREATE TYPE "VolunteerOpportunityStatus" AS ENUM ('OPEN', 'PAUSED', 'FILLED', 'CLOSED');
CREATE TYPE "BranchLaunchStatus" AS ENUM ('PLANNING', 'ACTIVE', 'LAUNCHED', 'CLOSED');
CREATE TYPE "BranchLaunchStepStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'DONE', 'BLOCKED');
CREATE TYPE "TranslationSourceType" AS ENUM ('ANNOUNCEMENT', 'SERMON', 'CHAT', 'POLICY', 'TRAINING', 'DOCUMENT', 'OTHER');
CREATE TYPE "TranslationRecordStatus" AS ENUM ('DRAFT', 'COMPLETED', 'APPROVED', 'ARCHIVED');
CREATE TYPE "MarketplaceListingStatus" AS ENUM ('AVAILABLE', 'REQUESTED', 'RESERVED', 'SHARED', 'ARCHIVED');
CREATE TYPE "MarketplaceRequestStatus" AS ENUM ('OPEN', 'OFFERED', 'FULFILLED', 'CANCELLED');
CREATE TYPE "RosterPlanStatus" AS ENUM ('DRAFT', 'GENERATED', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "LeadershipPipelineStatus" AS ENUM ('WATCHLIST', 'TRAINING', 'READY', 'APPOINTED', 'NOT_READY');
CREATE TYPE "BoardRecordType" AS ENUM ('MINUTES', 'RESOLUTION', 'LEGAL', 'FINANCE', 'APPROVAL', 'DOCUMENT');
CREATE TYPE "BoardRecordStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'ARCHIVED');

CREATE TABLE "VolunteerOpportunity" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "organizationUnitId" TEXT,
  "ministryId" TEXT,
  "title" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "location" TEXT,
  "requiredSkills" JSONB,
  "spiritualGifts" JSONB,
  "languages" JSONB,
  "interests" JSONB,
  "status" "VolunteerOpportunityStatus" NOT NULL DEFAULT 'OPEN',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VolunteerOpportunity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "VolunteerOpportunity_organizationUnitId_status_idx" ON "VolunteerOpportunity"("organizationUnitId", "status");
CREATE INDEX "VolunteerOpportunity_ministryId_status_idx" ON "VolunteerOpportunity"("ministryId", "status");
CREATE INDEX "VolunteerOpportunity_workspaceId_status_idx" ON "VolunteerOpportunity"("workspaceId", "status");

CREATE TABLE "VolunteerMatch" (
  "id" TEXT NOT NULL,
  "opportunityId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "score" INTEGER NOT NULL,
  "reasons" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VolunteerMatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VolunteerMatch_opportunityId_userId_key" ON "VolunteerMatch"("opportunityId", "userId");
CREATE INDEX "VolunteerMatch_opportunityId_score_idx" ON "VolunteerMatch"("opportunityId", "score");
CREATE INDEX "VolunteerMatch_userId_score_idx" ON "VolunteerMatch"("userId", "score");

CREATE TABLE "BranchLaunchPlan" (
  "id" TEXT NOT NULL,
  "organizationUnitId" TEXT,
  "name" TEXT NOT NULL,
  "country" TEXT,
  "city" TEXT,
  "targetLaunchAt" TIMESTAMP(3),
  "status" "BranchLaunchStatus" NOT NULL DEFAULT 'PLANNING',
  "leaderId" TEXT,
  "budgetAmount" INTEGER,
  "budgetCurrency" TEXT NOT NULL DEFAULT 'GBP',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BranchLaunchPlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BranchLaunchPlan_organizationUnitId_status_idx" ON "BranchLaunchPlan"("organizationUnitId", "status");
CREATE INDEX "BranchLaunchPlan_leaderId_status_idx" ON "BranchLaunchPlan"("leaderId", "status");
CREATE INDEX "BranchLaunchPlan_targetLaunchAt_status_idx" ON "BranchLaunchPlan"("targetLaunchAt", "status");

CREATE TABLE "BranchLaunchStep" (
  "id" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "status" "BranchLaunchStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "dueAt" TIMESTAMP(3),
  "ownerId" TEXT,
  "notes" TEXT,
  "sortOrder" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BranchLaunchStep_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BranchLaunchStep_planId_sortOrder_idx" ON "BranchLaunchStep"("planId", "sortOrder");
CREATE INDEX "BranchLaunchStep_ownerId_status_idx" ON "BranchLaunchStep"("ownerId", "status");

CREATE TABLE "TranslationRecord" (
  "id" TEXT NOT NULL,
  "sourceType" "TranslationSourceType" NOT NULL,
  "sourceId" TEXT,
  "title" TEXT NOT NULL,
  "sourceLanguage" TEXT NOT NULL DEFAULT 'en',
  "targetLanguage" TEXT NOT NULL,
  "originalText" TEXT NOT NULL,
  "translatedText" TEXT NOT NULL,
  "status" "TranslationRecordStatus" NOT NULL DEFAULT 'COMPLETED',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TranslationRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TranslationRecord_sourceType_sourceId_idx" ON "TranslationRecord"("sourceType", "sourceId");
CREATE INDEX "TranslationRecord_targetLanguage_status_idx" ON "TranslationRecord"("targetLanguage", "status");
CREATE INDEX "TranslationRecord_createdById_createdAt_idx" ON "TranslationRecord"("createdById", "createdAt");

CREATE TABLE "ResourceMarketplaceListing" (
  "id" TEXT NOT NULL,
  "resourceId" TEXT,
  "organizationUnitId" TEXT,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "description" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "location" TEXT,
  "availableFrom" TIMESTAMP(3),
  "status" "MarketplaceListingStatus" NOT NULL DEFAULT 'AVAILABLE',
  "offeredById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResourceMarketplaceListing_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ResourceMarketplaceListing_organizationUnitId_status_idx" ON "ResourceMarketplaceListing"("organizationUnitId", "status");
CREATE INDEX "ResourceMarketplaceListing_category_status_idx" ON "ResourceMarketplaceListing"("category", "status");
CREATE INDEX "ResourceMarketplaceListing_offeredById_createdAt_idx" ON "ResourceMarketplaceListing"("offeredById", "createdAt");

CREATE TABLE "ResourceMarketplaceRequest" (
  "id" TEXT NOT NULL,
  "listingId" TEXT,
  "organizationUnitId" TEXT,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "neededBy" TIMESTAMP(3),
  "status" "MarketplaceRequestStatus" NOT NULL DEFAULT 'OPEN',
  "requestedById" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ResourceMarketplaceRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ResourceMarketplaceRequest_listingId_status_idx" ON "ResourceMarketplaceRequest"("listingId", "status");
CREATE INDEX "ResourceMarketplaceRequest_organizationUnitId_status_idx" ON "ResourceMarketplaceRequest"("organizationUnitId", "status");
CREATE INDEX "ResourceMarketplaceRequest_category_status_idx" ON "ResourceMarketplaceRequest"("category", "status");

CREATE TABLE "RosterPlan" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "organizationUnitId" TEXT,
  "ministryId" TEXT,
  "title" TEXT NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" "RosterPlanStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RosterPlan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "RosterPlan_workspaceId_status_startsAt_idx" ON "RosterPlan"("workspaceId", "status", "startsAt");
CREATE INDEX "RosterPlan_organizationUnitId_status_startsAt_idx" ON "RosterPlan"("organizationUnitId", "status", "startsAt");
CREATE INDEX "RosterPlan_ministryId_status_idx" ON "RosterPlan"("ministryId", "status");

CREATE TABLE "RosterAssignment" (
  "id" TEXT NOT NULL,
  "rosterPlanId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "dutyDate" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RosterAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "RosterAssignment_rosterPlanId_userId_role_dutyDate_key" ON "RosterAssignment"("rosterPlanId", "userId", "role", "dutyDate");
CREATE INDEX "RosterAssignment_userId_dutyDate_idx" ON "RosterAssignment"("userId", "dutyDate");
CREATE INDEX "RosterAssignment_rosterPlanId_role_idx" ON "RosterAssignment"("rosterPlanId", "role");

CREATE TABLE "LeadershipCandidate" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "organizationUnitId" TEXT,
  "ministryId" TEXT,
  "score" INTEGER NOT NULL,
  "status" "LeadershipPipelineStatus" NOT NULL DEFAULT 'WATCHLIST',
  "strengths" JSONB,
  "risks" JSONB,
  "recommendation" TEXT,
  "nominatedById" TEXT,
  "reviewedById" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LeadershipCandidate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LeadershipCandidate_userId_organizationUnitId_ministryId_key" ON "LeadershipCandidate"("userId", "organizationUnitId", "ministryId");
CREATE INDEX "LeadershipCandidate_status_score_idx" ON "LeadershipCandidate"("status", "score");
CREATE INDEX "LeadershipCandidate_organizationUnitId_status_idx" ON "LeadershipCandidate"("organizationUnitId", "status");
CREATE INDEX "LeadershipCandidate_ministryId_status_idx" ON "LeadershipCandidate"("ministryId", "status");

CREATE TABLE "BoardRecord" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT,
  "organizationUnitId" TEXT,
  "recordType" "BoardRecordType" NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "confidential" BOOLEAN NOT NULL DEFAULT true,
  "status" "BoardRecordStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT NOT NULL,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BoardRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BoardRecord_recordType_status_createdAt_idx" ON "BoardRecord"("recordType", "status", "createdAt");
CREATE INDEX "BoardRecord_workspaceId_status_idx" ON "BoardRecord"("workspaceId", "status");
CREATE INDEX "BoardRecord_organizationUnitId_status_idx" ON "BoardRecord"("organizationUnitId", "status");

CREATE TABLE "BoardDecision" (
  "id" TEXT NOT NULL,
  "recordId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "ownerId" TEXT,
  "dueAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BoardDecision_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BoardDecision_recordId_createdAt_idx" ON "BoardDecision"("recordId", "createdAt");
CREATE INDEX "BoardDecision_ownerId_dueAt_idx" ON "BoardDecision"("ownerId", "dueAt");
