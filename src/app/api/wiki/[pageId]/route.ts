import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireWorkspacePermission } from "@/lib/rbac";
import { updateWikiPageSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ pageId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { pageId } = await context.params;
    const existing = await prisma.wikiPage.findUnique({ where: { id: pageId } });

    if (!existing) {
      throw new ApiError(404, "Knowledge page not found.");
    }

    await requireWorkspacePermission(user.id, existing.workspaceId, "canCreateAnnouncements");
    const parsed = updateWikiPageSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid knowledge page.");
    }

    const page = await prisma.wikiPage.update({
      where: { id: pageId },
      data: {
        title: parsed.data.title,
        content: parsed.data.content,
        status: parsed.data.status,
        updatedById: user.id
      }
    });

    return ok({ page });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { pageId } = await context.params;
    const existing = await prisma.wikiPage.findUnique({ where: { id: pageId } });

    if (!existing) {
      throw new ApiError(404, "Knowledge page not found.");
    }

    await requireWorkspacePermission(user.id, existing.workspaceId, "canCreateAnnouncements");
    await prisma.wikiPage.delete({ where: { id: pageId } });
    return ok({ deleted: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
