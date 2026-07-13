import {
  DigitalSignatureStatus,
  GivingReceiptStatus,
  LeadershipHandoverStatus,
  MembershipCardStatus,
  MonthlyReportStatus,
  OfficialLetterStatus
} from "@prisma/client";
import { z } from "zod";

import { logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";

export const runtime = "nodejs";

const registryActionSchema = z.object({
  kind: z.enum(["LETTER", "CERTIFICATE", "GIVING_RECEIPT", "DIGITAL_ID", "MONTHLY_REPORT", "HANDOVER", "DIGITAL_SIGNATURE"]),
  recordId: z.string().cuid(),
  action: z.enum(["REVOKE", "REISSUE"])
});

export async function PATCH(request: Request) {
  try {
    const actor = await requireUser();
    if (!(await hasAnyWorkspaceAdminRole(actor.id))) {
      throw new ApiError(403, "Only administrators can control official seals.");
    }

    const parsed = registryActionSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid seal registry action.");
    }
    const { action, kind, recordId } = parsed.data;
    const now = new Date();
    let result: unknown;

    if (kind === "LETTER") {
      result = await prisma.officialLetter.update({
        where: { id: recordId },
        data:
          action === "REVOKE"
            ? { status: OfficialLetterStatus.REVOKED, revokedAt: now }
            : { status: OfficialLetterStatus.ISSUED, issuedAt: now, revokedAt: null }
      });
    } else if (kind === "CERTIFICATE") {
      result = await prisma.memberCertificationBadge.update({
        where: { id: recordId },
        data: action === "REVOKE" ? { status: "REVOKED", revokedAt: now } : { status: "ACTIVE", revokedAt: null }
      });
    } else if (kind === "GIVING_RECEIPT") {
      result = await prisma.givingReceipt.update({
        where: { id: recordId },
        data:
          action === "REVOKE"
            ? { status: GivingReceiptStatus.REVOKED, revokedAt: now, revokedById: actor.id }
            : { status: GivingReceiptStatus.ACTIVE, revokedAt: null, revokedById: null }
      });
    } else if (kind === "DIGITAL_ID") {
      result = await prisma.digitalMembershipCard.update({
        where: { id: recordId },
        data:
          action === "REVOKE"
            ? {
                status: MembershipCardStatus.REVOKED,
                revokedAt: now,
                revokedById: actor.id,
                lastStatusReason: "Revoked from official seal registry"
              }
            : {
                status: MembershipCardStatus.ACTIVE,
                revokedAt: null,
                revokedById: null,
                deletedAt: null,
                deletedById: null,
                lastStatusReason: "Reissued from official seal registry"
              }
      });
    } else if (kind === "MONTHLY_REPORT") {
      result = await prisma.monthlyMinistryReport.update({
        where: { id: recordId },
        data:
          action === "REVOKE"
            ? { status: MonthlyReportStatus.ARCHIVED }
            : { status: MonthlyReportStatus.FINAL, finalizedAt: now }
      });
    } else if (kind === "HANDOVER") {
      const existing = await prisma.leadershipHandover.findUnique({
        where: { id: recordId },
        select: { completedAt: true, acceptedAt: true }
      });
      if (!existing) throw new ApiError(404, "Handover record not found.");
      result = await prisma.leadershipHandover.update({
        where: { id: recordId },
        data:
          action === "REVOKE"
            ? { status: LeadershipHandoverStatus.CANCELLED }
            : {
                status: existing.completedAt ? LeadershipHandoverStatus.COMPLETED : LeadershipHandoverStatus.ACCEPTED,
                acceptedAt: existing.acceptedAt ?? now
              }
      });
    } else {
      result = await prisma.digitalSignature.update({
        where: { id: recordId },
        data:
          action === "REVOKE"
            ? { status: DigitalSignatureStatus.REVOKED, revokedAt: now }
            : { status: DigitalSignatureStatus.SIGNED, signedAt: now, revokedAt: null }
      });
    }

    await logActivity({
      userId: actor.id,
      action: action === "REVOKE" ? "official_seal.revoked" : "official_seal.reissued",
      targetId: recordId,
      metadata: { kind, action }
    });

    return ok({ result, action, kind, recordId });
  } catch (error) {
    return handleRouteError(error);
  }
}
