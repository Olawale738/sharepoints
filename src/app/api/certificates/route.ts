import { randomUUID } from "crypto";
import { z } from "zod";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole, requireAnyWorkspaceAdmin } from "@/lib/rbac";

const certificateSchema = z.object({
  userId: z.string().cuid(),
  title: z.enum([
    "Baptism Certificate",
    "Membership Certificate",
    "Training Completion Certificate",
    "Ordination Certificate",
    "Conference Certificate",
    "Volunteer Service Certificate"
  ]),
  issuer: z.string().trim().min(2).max(160).optional(),
  certificateNumber: z.string().trim().min(3).max(80).optional().nullable(),
  expiresAt: z.string().datetime().optional().nullable()
});

export async function GET() {
  try {
    const user = await requireUser();
    const isAdmin = await hasAnyWorkspaceAdminRole(user.id);
    const certificateRows = await prisma.memberCertificationBadge.findMany({
      where: isAdmin ? undefined : { userId: user.id },
      orderBy: { issuedAt: "desc" },
      take: isAdmin ? 500 : 50
    });
    const certificateUsers = await prisma.user.findMany({
      where: {
        id: {
          in: Array.from(new Set(certificateRows.map((certificate) => certificate.userId)))
        }
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        memberProfile: {
          select: {
            membershipNumber: true,
            organizationPosition: true,
            phone: true
          }
        }
      }
    });
    const usersById = new Map(certificateUsers.map((certificateUser) => [certificateUser.id, certificateUser]));

    return ok({
      certificates: certificateRows.map((certificate) => ({
        ...certificate,
        user: usersById.get(certificate.userId) ?? {
          id: certificate.userId,
          name: null,
          email: null,
          image: null,
          memberProfile: null
        }
      })),
      canManage: isAdmin
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requireUser();
    await requireAnyWorkspaceAdmin(actor.id, "Only administrators can issue certificates.");
    const parsed = certificateSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid certificate.");
    }

    const data = parsed.data;
    const recipient = await prisma.user.findFirst({
      where: {
        id: data.userId,
        deletedAt: null,
        accessRevokedAt: null
      },
      select: { id: true, name: true, email: true }
    });

    if (!recipient) {
      throw new ApiError(404, "Recipient not found or inactive.");
    }

    const certificate = await prisma.memberCertificationBadge.create({
      data: {
        userId: recipient.id,
        title: data.title,
        issuer: data.issuer || "Light Encounter Tabernacle Worldwide",
        certificateNumber:
          data.certificateNumber || `LETW-CERT-${new Date().getFullYear()}-${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`,
        verifyToken: randomUUID(),
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
        createdById: actor.id
      }
    });

    await logActivity({
      userId: actor.id,
      action: activityActions.certificationBadgeCreated,
      targetId: certificate.id,
      metadata: {
        recipientId: recipient.id,
        title: certificate.title,
        certificateNumber: certificate.certificateNumber
      }
    });

    return ok({ certificate }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
