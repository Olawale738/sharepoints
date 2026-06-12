import { SecurityEventType } from "@prisma/client";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { logSecurityEvent } from "@/lib/security";
import { createTotpSecret, createTotpUri, verifyTotpCode } from "@/lib/totp";
import { twoFactorCodeSchema } from "@/lib/validators";

export async function GET() {
  try {
    const user = await requireUser();
    const account = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        email: true,
        twoFactorEnabled: true,
        twoFactorSecret: true
      }
    });

    if (!account?.email) {
      throw new ApiError(404, "Account not found.");
    }

    if (account.twoFactorEnabled) {
      return ok({ enabled: true });
    }

    const secret = account.twoFactorSecret ?? createTotpSecret();

    if (!account.twoFactorSecret) {
      await prisma.user.update({
        where: { id: user.id },
        data: { twoFactorSecret: secret }
      });
    }

    return ok({
      enabled: false,
      secret,
      uri: createTotpUri(secret, account.email)
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = twoFactorCodeSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw new ApiError(422, "Enter a valid six-digit code.");
    }

    const account = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        email: true,
        twoFactorSecret: true
      }
    });

    if (!account?.twoFactorSecret || !verifyTotpCode(account.twoFactorSecret, parsed.data.code)) {
      throw new ApiError(422, "The authenticator code is incorrect.");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true }
    });
    await logSecurityEvent({
      userId: user.id,
      type: SecurityEventType.TWO_FACTOR_ENABLED,
      email: account.email
    });

    return ok({ enabled: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const parsed = twoFactorCodeSchema.safeParse(await request.json());

    if (!parsed.success) {
      throw new ApiError(422, "Enter a valid six-digit code.");
    }

    const account = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        email: true,
        twoFactorSecret: true
      }
    });

    if (!account?.twoFactorSecret || !verifyTotpCode(account.twoFactorSecret, parsed.data.code)) {
      throw new ApiError(422, "The authenticator code is incorrect.");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null
      }
    });
    await logSecurityEvent({
      userId: user.id,
      type: SecurityEventType.TWO_FACTOR_DISABLED,
      email: account.email
    });

    return ok({ enabled: false });
  } catch (error) {
    return handleRouteError(error);
  }
}
