import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { updateProfileSchema } from "@/lib/validators";

export async function GET() {
  try {
    const user = await requireUser();
    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true
      }
    });

    return ok({ user: profile });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const parsed = updateProfileSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid profile details.");
    }

    const profile = await prisma.user.update({
      where: { id: user.id },
      data: {
        name: parsed.data.name,
        image: parsed.data.image || null
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true
      }
    });

    return ok({ user: profile });
  } catch (error) {
    return handleRouteError(error);
  }
}

