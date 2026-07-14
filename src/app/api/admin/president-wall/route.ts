import { ApprovalStatus } from "@prisma/client";
import { z } from "zod";

import { handleRouteError, ok, requireUser } from "@/lib/api";
import {
  getPresidentWallCenter,
  reviewPresidentialApprovalItem,
  updateApprovalWallPolicy,
  updateEmergencyLockdown,
  updateWorkspaceLock
} from "@/lib/president-controls";

export const runtime = "nodejs";

const policySchema = z.object({
  entity: z.literal("POLICY"),
  active: z.boolean().optional(),
  requireOfficialLetters: z.boolean().optional(),
  requireCertificates: z.boolean().optional(),
  requireIdCards: z.boolean().optional(),
  requireLeadershipAppointments: z.boolean().optional(),
  requireSensitiveFiles: z.boolean().optional(),
  requireFinancialApprovals: z.boolean().optional()
});

const lockdownSchema = z.object({
  entity: z.literal("LOCKDOWN"),
  active: z.boolean().optional(),
  lockDownloads: z.boolean().optional(),
  lockNewLogins: z.boolean().optional(),
  freezeDocumentChanges: z.boolean().optional(),
  disableOfficialIssuing: z.boolean().optional(),
  lockWorkspaceActions: z.boolean().optional(),
  lockFinancialActions: z.boolean().optional(),
  reason: z.string().trim().max(2000).nullable().optional()
});

const workspaceLockSchema = z.object({
  entity: z.literal("WORKSPACE_LOCK"),
  workspaceId: z.string().cuid(),
  locked: z.boolean(),
  reason: z.string().trim().max(2000).nullable().optional()
});

const patchSchema = z.discriminatedUnion("entity", [policySchema, lockdownSchema, workspaceLockSchema]);

const decisionSchema = z.object({
  id: z.string().cuid(),
  status: z.enum(["APPROVED", "REJECTED"]),
  reason: z.string().trim().max(2000).nullable().optional()
});

export async function GET() {
  try {
    const user = await requireUser();
    return ok(await getPresidentWallCenter(user.id));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const data = patchSchema.parse(await request.json());
    if (data.entity === "POLICY") {
      return ok({
        policy: await updateApprovalWallPolicy(user.id, {
          active: data.active,
          requireOfficialLetters: data.requireOfficialLetters,
          requireCertificates: data.requireCertificates,
          requireIdCards: data.requireIdCards,
          requireLeadershipAppointments: data.requireLeadershipAppointments,
          requireSensitiveFiles: data.requireSensitiveFiles,
          requireFinancialApprovals: data.requireFinancialApprovals
        })
      });
    }
    if (data.entity === "WORKSPACE_LOCK") {
      return ok({
        workspace: await updateWorkspaceLock(user.id, data.workspaceId, data.locked, data.reason ?? null)
      });
    }
    return ok({
      lockdown: await updateEmergencyLockdown(user.id, {
        active: data.active,
        lockDownloads: data.lockDownloads,
        lockNewLogins: data.lockNewLogins,
        freezeDocumentChanges: data.freezeDocumentChanges,
        disableOfficialIssuing: data.disableOfficialIssuing,
        lockWorkspaceActions: data.lockWorkspaceActions,
        lockFinancialActions: data.lockFinancialActions,
        reason: data.reason
      })
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const data = decisionSchema.parse(await request.json());
    const item = await reviewPresidentialApprovalItem(
      user.id,
      data.id,
      data.status === "APPROVED" ? ApprovalStatus.APPROVED : ApprovalStatus.REJECTED,
      data.reason ?? null
    );
    return ok({ item });
  } catch (error) {
    return handleRouteError(error);
  }
}
