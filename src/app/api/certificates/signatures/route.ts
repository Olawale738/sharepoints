import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { requireAcademicCertificateIssuer, requireCertificateIssuer } from "@/lib/official-issuance";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const signatureSchema = z.object({
  ownerUserId: z.string().cuid().optional().nullable(),
  name: z.string().trim().min(2).max(160),
  title: z.string().trim().min(2).max(120),
  role: z.enum(["PRESIDENT", "RECTOR", "REGISTRAR", "SECRETARY", "OTHER"]).default("RECTOR"),
  imageUrl: z.string().trim().min(10).max(600).refine((value) => value.startsWith("/api/certificates/assets/") || value.startsWith("http://") || value.startsWith("https://"), {
    message: "Upload or choose a valid signature image."
  }),
  active: z.boolean().optional()
});

async function requireAnyCertificateAuthority(actorId: string) {
  try {
    await requireCertificateIssuer(actorId);
  } catch {
    await requireAcademicCertificateIssuer(actorId);
  }
}

export async function GET() {
  try {
    const actor = await requireUser();
    await requireAnyCertificateAuthority(actor.id);
    const signatures = await prisma.certificateSignatureProfile.findMany({
      where: { active: true },
      orderBy: [{ role: "asc" }, { name: "asc" }],
      take: 500
    });
    return ok({ signatures });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    await requireAnyCertificateAuthority(actor.id);
    const parsed = signatureSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid signature profile.");
    const signature = await prisma.certificateSignatureProfile.create({
      data: {
        ...parsed.data,
        active: parsed.data.active ?? true,
        approvedById: actor.id,
        createdById: actor.id
      }
    });
    return ok({ signature }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
