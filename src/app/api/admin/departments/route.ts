import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { hasAnyWorkspaceAdminRole } from "@/lib/rbac";
import { createDepartmentSchema } from "@/lib/validators";

export async function GET() {
  try {
    const user = await requireUser();

    if (!(await hasAnyWorkspaceAdminRole(user.id))) {
      throw new ApiError(403, "Only admins can view departments.");
    }

    const departments = await prisma.department.findMany({
      include: {
        _count: {
          select: {
            members: true,
            workspaceAccess: true
          }
        }
      },
      orderBy: [{ kind: "asc" }, { name: "asc" }]
    });

    return ok({ departments });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    if (!(await hasAnyWorkspaceAdminRole(user.id))) {
      throw new ApiError(403, "Only admins can create departments.");
    }

    const body = await request.json();
    const parsed = createDepartmentSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid department.");
    }

    const department = await prisma.department.create({
      data: {
        name: parsed.data.name,
        kind: parsed.data.kind ?? "DEPARTMENT",
        description: parsed.data.description || null,
        createdById: user.id
      },
      include: {
        _count: {
          select: {
            members: true,
            workspaceAccess: true
          }
        }
      }
    });

    return ok({ department }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
