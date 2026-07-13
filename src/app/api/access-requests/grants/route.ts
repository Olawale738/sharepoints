import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { getReviewableAccessWorkspaceIds, grantTemporaryAccess } from "@/lib/access-requests";
import { isPresidentDocumentAuthority } from "@/lib/governance";
import { prisma } from "@/lib/prisma";
import { grantTemporaryAccessSchema } from "@/lib/validators";

export async function GET() {
  try {
    const user = await requireUser();
    const workspaceIds = await getReviewableAccessWorkspaceIds(user.id);
    if (!workspaceIds.length) {
      throw new ApiError(403, "Your role cannot grant temporary access.");
    }
    const canManageDownloadGrants = await isPresidentDocumentAuthority(user.id);

    const [members, workspaces, files, grants, fileGrants] = await Promise.all([
      prisma.user.findMany({
        where: {
          deletedAt: null,
          suspendedAt: null,
          accessRevokedAt: null,
          email: { endsWith: "@letw.org" }
        },
        select: {
          id: true,
          name: true,
          email: true
        },
        orderBy: [{ name: "asc" }, { email: "asc" }],
        take: 500
      }),
      prisma.workspace.findMany({
        where: { id: { in: workspaceIds }, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
        take: 500
      }),
      prisma.file.findMany({
        where: {
          workspaceId: { in: workspaceIds },
          deletedAt: null,
          workspace: { deletedAt: null }
        },
        select: {
          id: true,
          fileName: true,
          workspace: { select: { name: true } }
        },
        orderBy: { createdAt: "desc" },
        take: 500
      }),
      prisma.temporaryWorkspaceAccess.findMany({
        where: {
          workspaceId: { in: workspaceIds },
          revokedAt: null,
          expiresAt: { gt: new Date() }
        },
        include: {
          workspace: { select: { id: true, name: true } },
          user: { select: { name: true, email: true } },
          grantedBy: { select: { name: true, email: true } }
        },
        orderBy: { expiresAt: "asc" },
        take: 100
      }),
      canManageDownloadGrants
        ? prisma.fileAccessGrant.findMany({
            where: {
              file: {
                workspaceId: { in: workspaceIds },
                deletedAt: null,
                workspace: { deletedAt: null }
              },
              revokedAt: null,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }]
            },
            include: {
              file: { select: { id: true, fileName: true, workspace: { select: { name: true } } } },
              user: { select: { name: true, email: true } },
              grantedBy: { select: { name: true, email: true } }
            },
            orderBy: { updatedAt: "desc" },
            take: 200
          })
        : Promise.resolve([])
    ]);

    return ok({ members, workspaces, files, grants, fileGrants, canManageDownloadGrants });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = grantTemporaryAccessSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid temporary access grant.");
    }

    const result = await grantTemporaryAccess({
      actorId: user.id,
      userId: parsed.data.userId,
      targetType: parsed.data.targetType,
      targetId: parsed.data.targetId,
      role: parsed.data.role,
      fileAccessLevel: parsed.data.fileAccessLevel,
      expiresInDays: parsed.data.expiresInDays,
      reason: parsed.data.reason
    });

    return ok(result, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
