-- CreateEnum
CREATE TYPE "VisitorJourneyType" AS ENUM ('VISITOR', 'NEW_CONVERT');

-- CreateEnum
CREATE TYPE "VisitorJourneyStage" AS ENUM ('REGISTERED', 'CONTACTED', 'COUNSELLING', 'FOUNDATION_CLASS', 'MEMBERSHIP_ONBOARDING', 'COMPLETED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "HelpDeskCategory" AS ENUM ('IT', 'FACILITY', 'FINANCE', 'ADMINISTRATION', 'OTHER');

-- CreateEnum
CREATE TYPE "HelpDeskPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateEnum
CREATE TYPE "HelpDeskStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'WAITING', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "FormPaymentStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'PAID', 'FAILED', 'WAIVED');

-- CreateEnum
CREATE TYPE "EventRegistrationStatus" AS ENUM ('REGISTERED', 'WAITLISTED', 'APPROVED', 'CHECKED_IN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PolicyStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'LIMITED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "DutyScheduleStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "locale" TEXT NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE "WorkspaceForm" ADD COLUMN     "paymentAmount" INTEGER,
ADD COLUMN     "paymentCurrency" TEXT NOT NULL DEFAULT 'GBP',
ADD COLUMN     "paymentRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paymentUrl" TEXT,
ADD COLUMN     "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "signatureRequired" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WorkspaceFormResponse" ADD COLUMN     "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'APPROVED',
ADD COLUMN     "paymentReference" TEXT,
ADD COLUMN     "paymentStatus" "FormPaymentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
ADD COLUMN     "rejectedReason" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMP(3),
ADD COLUMN     "reviewedById" TEXT,
ADD COLUMN     "signatureName" TEXT,
ADD COLUMN     "signedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "VisitorJourney" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "journeyType" "VisitorJourneyType" NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT,
    "firstVisitAt" TIMESTAMP(3),
    "stage" "VisitorJourneyStage" NOT NULL DEFAULT 'REGISTERED',
    "assignedToId" TEXT,
    "membershipUserId" TEXT,
    "nextContactAt" TIMESTAMP(3),
    "reminderAt" TIMESTAMP(3),
    "onboardingChecklist" JSONB,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitorJourney_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorJourneyNote" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "noteType" TEXT NOT NULL DEFAULT 'GENERAL',
    "content" TEXT NOT NULL,
    "confidential" BOOLEAN NOT NULL DEFAULT true,
    "nextContactAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorJourneyNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VisitorStageHistory" (
    "id" TEXT NOT NULL,
    "journeyId" TEXT NOT NULL,
    "fromStage" "VisitorJourneyStage",
    "toStage" "VisitorJourneyStage" NOT NULL,
    "changedById" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VisitorStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpDeskTicket" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "requesterId" TEXT NOT NULL,
    "category" "HelpDeskCategory" NOT NULL,
    "priority" "HelpDeskPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "HelpDeskStatus" NOT NULL DEFAULT 'OPEN',
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "assigneeId" TEXT,
    "responseDueAt" TIMESTAMP(3),
    "firstRespondedAt" TIMESTAMP(3),
    "firstResponseMinutes" INTEGER,
    "resolvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HelpDeskTicket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpDeskComment" (
    "id" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "internal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpDeskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventTicketConfiguration" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "capacity" INTEGER,
    "registrationOpensAt" TIMESTAMP(3),
    "registrationClosesAt" TIMESTAMP(3),
    "invitationCode" TEXT,
    "requireApproval" BOOLEAN NOT NULL DEFAULT false,
    "badgeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "certificateEnabled" BOOLEAN NOT NULL DEFAULT false,
    "paymentRequired" BOOLEAN NOT NULL DEFAULT false,
    "paymentAmount" INTEGER,
    "paymentCurrency" TEXT NOT NULL DEFAULT 'GBP',
    "paymentUrl" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventTicketConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventRegistration" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT,
    "displayName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "ticketCode" TEXT NOT NULL,
    "qrToken" TEXT NOT NULL,
    "invitationCodeUsed" TEXT,
    "status" "EventRegistrationStatus" NOT NULL DEFAULT 'REGISTERED',
    "paymentStatus" "FormPaymentStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "paymentReference" TEXT,
    "checkedInAt" TIMESTAMP(3),
    "checkedInById" TEXT,
    "badgePrintedAt" TIMESTAMP(3),
    "certificateIssuedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyDocument" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content" TEXT NOT NULL,
    "fileId" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "PolicyStatus" NOT NULL DEFAULT 'DRAFT',
    "dueDays" INTEGER NOT NULL DEFAULT 14,
    "reminderDays" JSONB,
    "createdById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyAssignment" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "signatureName" TEXT,
    "signatureIp" TEXT,
    "reminderSentAt" TIMESTAMP(3),

    CONSTRAINT "PolicyAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "leaveType" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StaffAvailability" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "status" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DutySchedule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "title" TEXT NOT NULL,
    "role" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "assignedToId" TEXT NOT NULL,
    "substituteUserId" TEXT,
    "status" "DutyScheduleStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DutySchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisitorJourney_workspaceId_stage_nextContactAt_idx" ON "VisitorJourney"("workspaceId", "stage", "nextContactAt");

-- CreateIndex
CREATE INDEX "VisitorJourney_assignedToId_stage_reminderAt_idx" ON "VisitorJourney"("assignedToId", "stage", "reminderAt");

-- CreateIndex
CREATE INDEX "VisitorJourney_email_idx" ON "VisitorJourney"("email");

-- CreateIndex
CREATE INDEX "VisitorJourney_phone_idx" ON "VisitorJourney"("phone");

-- CreateIndex
CREATE INDEX "VisitorJourneyNote_journeyId_createdAt_idx" ON "VisitorJourneyNote"("journeyId", "createdAt");

-- CreateIndex
CREATE INDEX "VisitorJourneyNote_authorId_createdAt_idx" ON "VisitorJourneyNote"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "VisitorStageHistory_journeyId_createdAt_idx" ON "VisitorStageHistory"("journeyId", "createdAt");

-- CreateIndex
CREATE INDEX "HelpDeskTicket_requesterId_status_createdAt_idx" ON "HelpDeskTicket"("requesterId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "HelpDeskTicket_assigneeId_status_responseDueAt_idx" ON "HelpDeskTicket"("assigneeId", "status", "responseDueAt");

-- CreateIndex
CREATE INDEX "HelpDeskTicket_workspaceId_category_status_idx" ON "HelpDeskTicket"("workspaceId", "category", "status");

-- CreateIndex
CREATE INDEX "HelpDeskComment_ticketId_createdAt_idx" ON "HelpDeskComment"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "HelpDeskComment_authorId_createdAt_idx" ON "HelpDeskComment"("authorId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventTicketConfiguration_eventId_key" ON "EventTicketConfiguration"("eventId");

-- CreateIndex
CREATE INDEX "EventTicketConfiguration_registrationClosesAt_idx" ON "EventTicketConfiguration"("registrationClosesAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_ticketCode_key" ON "EventRegistration"("ticketCode");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_qrToken_key" ON "EventRegistration"("qrToken");

-- CreateIndex
CREATE INDEX "EventRegistration_eventId_status_createdAt_idx" ON "EventRegistration"("eventId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "EventRegistration_email_eventId_idx" ON "EventRegistration"("email", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "EventRegistration_eventId_userId_key" ON "EventRegistration"("eventId", "userId");

-- CreateIndex
CREATE INDEX "PolicyDocument_workspaceId_status_publishedAt_idx" ON "PolicyDocument"("workspaceId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "PolicyAssignment_userId_acknowledgedAt_dueAt_idx" ON "PolicyAssignment"("userId", "acknowledgedAt", "dueAt");

-- CreateIndex
CREATE INDEX "PolicyAssignment_policyId_acknowledgedAt_idx" ON "PolicyAssignment"("policyId", "acknowledgedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyAssignment_policyId_userId_key" ON "PolicyAssignment"("policyId", "userId");

-- CreateIndex
CREATE INDEX "LeaveRequest_userId_startsAt_endsAt_idx" ON "LeaveRequest"("userId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "LeaveRequest_workspaceId_status_startsAt_idx" ON "LeaveRequest"("workspaceId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "LeaveRequest_reviewerId_status_idx" ON "LeaveRequest"("reviewerId", "status");

-- CreateIndex
CREATE INDEX "StaffAvailability_status_weekday_idx" ON "StaffAvailability"("status", "weekday");

-- CreateIndex
CREATE UNIQUE INDEX "StaffAvailability_userId_weekday_key" ON "StaffAvailability"("userId", "weekday");

-- CreateIndex
CREATE INDEX "DutySchedule_assignedToId_startsAt_idx" ON "DutySchedule"("assignedToId", "startsAt");

-- CreateIndex
CREATE INDEX "DutySchedule_substituteUserId_startsAt_idx" ON "DutySchedule"("substituteUserId", "startsAt");

-- CreateIndex
CREATE INDEX "DutySchedule_workspaceId_status_startsAt_idx" ON "DutySchedule"("workspaceId", "status", "startsAt");
