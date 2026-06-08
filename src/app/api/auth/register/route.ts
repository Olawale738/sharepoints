import { hash } from "bcryptjs";

import { ApiError, handleRouteError, ok } from "@/lib/api";
import {
  blockedSelfRegistrationMessage,
  isBlockedSelfRegistrationEmail,
  markCompanyInvitationAccepted,
  normalizeEmail
} from "@/lib/email-policy";
import { prisma } from "@/lib/prisma";
import { registerSchema } from "@/lib/validators";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid registration details.");
    }

    const email = normalizeEmail(parsed.data.email);

    if (await isBlockedSelfRegistrationEmail(email)) {
      throw new ApiError(403, blockedSelfRegistrationMessage);
    }

    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      throw new ApiError(409, "An account already exists for this email.");
    }

    const passwordHash = await hash(parsed.data.password, 12);
    const user = await prisma.user.create({
      data: {
        name: parsed.data.name,
        email,
        passwordHash
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true
      }
    });
    await markCompanyInvitationAccepted(email, user.id);

    return ok({ user }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
