import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { requireWorkspaceMembership } from "@/lib/rbac";
import { fileCommentSchema } from "@/lib/validators";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const file = await prisma.file.findUnique({
      where: { id },
      select: { workspaceId: true }
    });

    if (!file) {
      throw new ApiError(404, "File not found.");
    }

    await requireWorkspaceMembership(user.id, file.workspaceId);
    const parsed = fileCommentSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid comment.");
    }

    const comment = await prisma.fileComment.create({
      data: {
        fileId: id,
        authorId: user.id,
        body: parsed.data.body
      },
      include: {
        author: {
          select: { name: true, email: true }
        }
      }
    });

    return ok({ comment }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
