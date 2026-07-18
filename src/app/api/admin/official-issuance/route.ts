import { z } from "zod";

import { handleRouteError, ok, requireUser } from "@/lib/api";
import {
  grantOfficialIssuanceAuthority,
  listOfficialIssuanceCenter,
  revokeOfficialIssuanceAuthority
} from "@/lib/official-issuance";

export const runtime = "nodejs";

const grantSchema = z.object({
  userId: z.string().cuid(),
  canIssueCertificates: z.boolean().default(false),
  canIssueAcademicCertificates: z.boolean().default(false),
  canManageSchoolAcademics: z.boolean().default(false),
  canIssueIdCards: z.boolean().default(false),
  canIssueLetters: z.boolean().default(false),
  expiresAt: z.string().datetime().nullable().optional(),
  reason: z.string().trim().max(1000).nullable().optional()
});

const revokeSchema = z.object({
  userId: z.string().cuid()
});

export async function GET() {
  try {
    const user = await requireUser();
    return ok(await listOfficialIssuanceCenter(user.id));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const data = grantSchema.parse(await request.json());
    const grant = await grantOfficialIssuanceAuthority(user.id, {
      ...data,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null
    });

    return ok({ grant }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const data = revokeSchema.parse(await request.json());
    const grant = await revokeOfficialIssuanceAuthority(user.id, data.userId);

    return ok({ grant });
  } catch (error) {
    return handleRouteError(error);
  }
}
