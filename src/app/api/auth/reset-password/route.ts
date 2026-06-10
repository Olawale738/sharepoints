import { hash } from "bcryptjs";

import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok } from "@/lib/api";
import { hasCompanyEmailInvitation, normalizeEmail } from "@/lib/email-policy";
import { hashPasswordResetToken } from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";
import { logSecurityEvent } from "@/lib/security";
import { resetPasswordSchema } from "@/lib/validators";
import { SecurityEventType } from "@prisma/client";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid password reset details.");
    }

    const email = normalizeEmail(parsed.data.email);

    if (!(await hasCompanyEmailInvitation(email))) {
      throw new ApiError(403, "Only invited @letw.org accounts can reset a LETW password.");
    }

    const tokenHash = hashPasswordResetToken(parsed.data.token);
    const resetToken = await prisma.passwordResetToken.findFirst({
      where: {
        email,
        tokenHash,
        usedAt: null,
        expiresAt: {
          gt: new Date()
        }
      },
      select: {
        id: true,
        userId: true
      }
    });

    if (!resetToken) {
      throw new ApiError(400, "This password reset link is invalid or expired.");
    }

    const passwordHash = await hash(parsed.data.password, 12);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: {
          passwordHash,
          forcePasswordReset: false,
          sessionVersion: {
            increment: 1
          }
        }
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() }
      }),
      prisma.passwordResetToken.deleteMany({
        where: {
          userId: resetToken.userId,
          id: {
            not: resetToken.id
          }
        }
      }),
      prisma.session.deleteMany({
        where: { userId: resetToken.userId }
      })
    ]);

    await logActivity({
      userId: resetToken.userId,
      action: activityActions.passwordResetCompleted,
      targetId: resetToken.userId
    });
    await logSecurityEvent({
      userId: resetToken.userId,
      type: SecurityEventType.PASSWORD_RESET,
      email
    });

    return ok({ message: "Password changed. You can now sign in with the new password." });
  } catch (error) {
    return handleRouteError(error);
  }
}
