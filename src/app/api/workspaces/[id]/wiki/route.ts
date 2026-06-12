import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership, requireWorkspacePermission } from "@/lib/rbac";
import { createWikiPageSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspaceMembership(user.id, id);
    const pages = await prisma.wikiPage.findMany({
      where: {
        workspaceId: id,
        OR: [{ status: "PUBLISHED" }, { authorId: user.id }]
      },
      include: {
        author: {
          select: { name: true, email: true }
        },
        updatedBy: {
          select: { name: true, email: true }
        }
      },
      orderBy: { updatedAt: "desc" }
    });

    return ok({ pages });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    await requireWorkspacePermission(user.id, id, "canCreateAnnouncements");
    const parsed = createWikiPageSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid knowledge page.");
    }

    const baseSlug = slugify(parsed.data.title) || "page";
    let slug = baseSlug;
    let suffix = 1;

    while (await prisma.wikiPage.findUnique({ where: { workspaceId_slug: { workspaceId: id, slug } } })) {
      suffix += 1;
      slug = `${baseSlug}-${suffix}`;
    }

    const page = await prisma.wikiPage.create({
      data: {
        workspaceId: id,
        authorId: user.id,
        updatedById: user.id,
        title: parsed.data.title,
        slug,
        content: parsed.data.content,
        status: parsed.data.status ?? "DRAFT"
      },
      include: {
        author: { select: { name: true, email: true } },
        updatedBy: { select: { name: true, email: true } }
      }
    });

    return ok({ page }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
