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
        locale: true,
        memberProfile: {
          select: {
            organizationPosition: true,
            digitalIdLocation: true
          }
        },
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

    const profile = await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          name: parsed.data.name,
          image: parsed.data.image || null,
          locale: parsed.data.locale
        }
      });
      await tx.memberProfile.upsert({
        where: { userId: user.id },
        update: {
          organizationPosition:
            parsed.data.organizationPosition === undefined
              ? undefined
              : parsed.data.organizationPosition || null,
          digitalIdLocation:
            parsed.data.digitalIdLocation === undefined
              ? undefined
              : parsed.data.digitalIdLocation || "LETTW Worldwide"
        },
        create: {
          userId: user.id,
          organizationPosition: parsed.data.organizationPosition || null,
          digitalIdLocation: parsed.data.digitalIdLocation || "LETTW Worldwide"
        }
      });
      return tx.user.findUnique({
        where: { id: user.id },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          locale: true,
          memberProfile: {
            select: {
              organizationPosition: true,
              digitalIdLocation: true
            }
          }
        }
      });
    });

    return ok({ user: profile });
  } catch (error) {
    return handleRouteError(error);
  }
}
