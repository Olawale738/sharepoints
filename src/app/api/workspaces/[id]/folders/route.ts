import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership, requireWorkspacePermission } from "@/lib/rbac";
import { createFolderSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspaceMembership(user.id, id);

    const { searchParams } = new URL(request.url);
    const parentId = searchParams.get("parentId");

    if (parentId) {
      const parent = await prisma.folder.findFirst({
        where: {
          id: parentId,
          workspaceId: id
        },
        select: { id: true }
      });

      if (!parent) {
        throw new ApiError(404, "Parent folder not found.");
      }
    }

    const folders = await prisma.folder.findMany({
      where: {
        workspaceId: id,
        parentId: parentId || null
      },
      orderBy: {
        name: "asc"
      }
    });

    return ok({ folders });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspacePermission(user.id, id, "canCreateFolders");

    const body = await request.json();
    const parsed = createFolderSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid folder details.");
    }

    if (parsed.data.parentId) {
      const parent = await prisma.folder.findFirst({
        where: {
          id: parsed.data.parentId,
          workspaceId: id
        }
      });

      if (!parent) {
        throw new ApiError(404, "Parent folder not found.");
      }
    }

    const duplicate = await prisma.folder.findFirst({
      where: {
        workspaceId: id,
        parentId: parsed.data.parentId || null,
        name: parsed.data.name
      }
    });

    if (duplicate) {
      throw new ApiError(409, "A folder with this name already exists here.");
    }

    const folder = await prisma.folder.create({
      data: {
        workspaceId: id,
        parentId: parsed.data.parentId || null,
        name: parsed.data.name,
        createdById: user.id
      }
    });

    await logActivity({
      userId: user.id,
      workspaceId: id,
      action: activityActions.folderCreated,
      targetId: folder.id,
      metadata: { name: folder.name, parentId: folder.parentId }
    });

    return ok({ folder }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
