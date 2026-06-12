import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership, requireWorkspacePermission } from "@/lib/rbac";
import { createWorkspaceFormSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspaceMembership(user.id, id);
    const forms = await prisma.workspaceForm.findMany({
      where: {
        workspaceId: id,
        OR: [{ status: "OPEN" }, { createdById: user.id }]
      },
      include: {
        createdBy: {
          select: { name: true, email: true }
        },
        responses: {
          where: { respondentId: user.id },
          select: { id: true, createdAt: true }
        },
        _count: {
          select: { responses: true }
        }
      },
      orderBy: { updatedAt: "desc" }
    });

    return ok({ forms });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspacePermission(user.id, id, "canCreateAnnouncements");
    const parsed = createWorkspaceFormSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid form.");
    }

    const form = await prisma.workspaceForm.create({
      data: {
        workspaceId: id,
        createdById: user.id,
        title: parsed.data.title,
        description: parsed.data.description || null,
        status: parsed.data.status ?? "DRAFT",
        fields: parsed.data.fields
      },
      include: {
        createdBy: { select: { name: true, email: true } },
        _count: { select: { responses: true } }
      }
    });

    return ok({ form }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
