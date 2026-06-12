import { type NextRequest } from "next/server";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership } from "@/lib/rbac";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspaceMembership(user.id, id);

    const folderId = request.nextUrl.searchParams.get("folderId");

    if (folderId) {
      const folder = await prisma.folder.findFirst({
        where: {
          id: folderId,
          workspaceId: id,
          deletedAt: null
        },
        select: { id: true }
      });

      if (!folder) {
        throw new ApiError(404, "Folder not found.");
      }
    }

    const files = await prisma.file.findMany({
      where: {
        workspaceId: id,
        folderId: folderId || null,
        deletedAt: null
      },
      include: {
        uploadedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true
          }
        },
        folder: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    return ok({ files });
  } catch (error) {
    return handleRouteError(error);
  }
}
