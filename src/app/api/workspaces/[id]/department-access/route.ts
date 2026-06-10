import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceAdminAccess } from "@/lib/rbac";
import { upsertWorkspaceDepartmentAccessSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspaceAdminAccess(user.id, id, "Only admins can view department access.");

    const access = await prisma.workspaceDepartmentAccess.findMany({
      where: {
        workspaceId: id
      },
      include: {
        department: true
      },
      orderBy: {
        department: {
          name: "asc"
        }
      }
    });

    return ok({ access });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspaceAdminAccess(user.id, id, "Only admins can update department access.");

    const body = await request.json();
    const parsed = upsertWorkspaceDepartmentAccessSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid department access.");
    }

    const department = await prisma.department.findUnique({
      where: {
        id: parsed.data.departmentId
      },
      select: {
        id: true
      }
    });

    if (!department) {
      throw new ApiError(404, "Department not found.");
    }

    const access = parsed.data.canAccessWorkspace || parsed.data.canAccessChat
      ? await prisma.workspaceDepartmentAccess.upsert({
          where: {
            workspaceId_departmentId: {
              workspaceId: id,
              departmentId: parsed.data.departmentId
            }
          },
          update: {
            canAccessWorkspace: parsed.data.canAccessWorkspace,
            canAccessChat: parsed.data.canAccessChat
          },
          create: {
            workspaceId: id,
            departmentId: parsed.data.departmentId,
            canAccessWorkspace: parsed.data.canAccessWorkspace,
            canAccessChat: parsed.data.canAccessChat
          },
          include: {
            department: true
          }
        })
      : await prisma.workspaceDepartmentAccess
          .delete({
            where: {
              workspaceId_departmentId: {
                workspaceId: id,
                departmentId: parsed.data.departmentId
              }
            },
            include: {
              department: true
            }
          })
          .catch(() => null);

    return ok({ access });
  } catch (error) {
    return handleRouteError(error);
  }
}
