import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { requireAcademicCertificateIssuer, requireCertificateIssuer } from "@/lib/official-issuance";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const updateSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  title: z.string().trim().min(2).max(120).optional(),
  role: z.enum(["PRESIDENT", "RECTOR", "REGISTRAR", "SECRETARY", "OTHER"]).optional(),
  imageUrl: z.string().trim().min(10).max(600).optional(),
  active: z.boolean().optional()
});

async function requireAnyCertificateAuthority(actorId: string) {
  try {
    await requireCertificateIssuer(actorId);
  } catch {
    await requireAcademicCertificateIssuer(actorId);
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const actor = await requireUser();
    await requireAnyCertificateAuthority(actor.id);
    const { id } = await context.params;
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid signature update.");
    const signature = await prisma.certificateSignatureProfile.update({
      where: { id },
      data: parsed.data
    });
    return ok({ signature });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const actor = await requireUser();
    await requireAnyCertificateAuthority(actor.id);
    const { id } = await context.params;
    const signature = await prisma.certificateSignatureProfile.update({
      where: { id },
      data: { active: false }
    });
    return ok({ signature });
  } catch (error) {
    return handleRouteError(error);
  }
}
