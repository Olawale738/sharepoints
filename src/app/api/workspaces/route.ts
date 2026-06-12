import { Prisma, WorkspaceRole } from "@prisma/client";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { activityActions, logActivity } from "@/lib/activity";
import { getOrCreateGeneralChannel } from "@/lib/chat";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole, requireWorkspaceCreatorRole } from "@/lib/rbac";
import { createWorkspaceSchema } from "@/lib/validators";
import { slugify } from "@/lib/utils";
import { applyWorkspaceTemplate } from "@/lib/workspace-templates";

export async function GET() {
  try {
    const user = await requireUser();
    const isGlobalAdmin = await hasAnyWorkspaceAdminRole(user.id);

    if (isGlobalAdmin) {
      const workspaces = await prisma.workspace.findMany({
        where: { deletedAt: null },
        include: {
          _count: {
            select: {
              files: true,
              members: true
            }
          }
        },
        orderBy: {
          createdAt: "asc"
        }
      });

      return ok({
        workspaces: workspaces.map((workspace) => ({
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          description: workspace.description,
          joinCode: workspace.joinCode,
          role: WorkspaceRole.ADMIN,
          filesCount: workspace._count.files,
          membersCount: workspace._count.members,
          createdAt: workspace.createdAt
        }))
      });
    }

    const memberships = await prisma.workspaceMember.findMany({
      where: { userId: user.id, workspace: { deletedAt: null } },
      include: {
        workspace: {
          include: {
            _count: {
              select: {
                files: true,
                members: true
              }
            }
          }
        }
      },
      orderBy: {
        joinedAt: "asc"
      }
    });

    return ok({
      workspaces: memberships.map((membership) => ({
        id: membership.workspace.id,
        name: membership.workspace.name,
        slug: membership.workspace.slug,
        description: membership.workspace.description,
        joinCode: membership.role === "ADMIN" ? membership.workspace.joinCode : null,
        role: membership.role,
        filesCount: membership.workspace._count.files,
        membersCount: membership.workspace._count.members,
        createdAt: membership.workspace.createdAt
      }))
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireWorkspaceCreatorRole(user.id);

    const body = await request.json();
    const parsed = createWorkspaceSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid workspace details.");
    }

    const baseSlug = slugify(parsed.data.name) || "workspace";
    let slug = baseSlug;
    let suffix = 1;

    while (await prisma.workspace.findUnique({ where: { slug } })) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    const workspace = await prisma.workspace.create({
      data: {
        name: parsed.data.name,
        slug,
        description: parsed.data.description || null,
        createdById: user.id,
        members: {
          create: {
            userId: user.id,
            role: "ADMIN"
          }
        }
      },
      include: {
        members: true
      }
    });

    await logActivity({
      userId: user.id,
      workspaceId: workspace.id,
      action: activityActions.workspaceCreated,
      targetId: workspace.id,
      metadata: { name: workspace.name }
    });
    await getOrCreateGeneralChannel(workspace.id, user.id);
    if (parsed.data.templateId) {
      await applyWorkspaceTemplate(workspace.id, parsed.data.templateId, user.id);
    }

    return ok({ workspace }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return handleRouteError(new ApiError(409, "A workspace with this name already exists."));
    }

    return handleRouteError(error);
  }
}
