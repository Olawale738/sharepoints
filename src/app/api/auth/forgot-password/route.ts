import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok } from "@/lib/api";
import { hasCompanyEmailInvitation, normalizeEmail } from "@/lib/email-policy";
import {
  createPasswordResetToken,
  isDevelopmentResetLinkVisible,
  sendPasswordResetEmail
} from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";
import { forgotPasswordSchema } from "@/lib/validators";

const resetRequestMessage = "If this invited LETW account exists, a password reset link has been sent.";

export async function POST(request: Request) {
  try {
    if (process.env.NODE_ENV === "production" && (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)) {
      throw new ApiError(503, "Password reset email is not configured.");
    }

    const body = await request.json();
    const parsed = forgotPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return ok({ message: resetRequestMessage });
    }

    const email = normalizeEmail(parsed.data.email);

    if (!(await hasCompanyEmailInvitation(email))) {
      return ok({ message: resetRequestMessage });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true
      }
    });

    if (!user?.email) {
      return ok({ message: resetRequestMessage });
    }

    const resetToken = await createPasswordResetToken(user.id, email);
    const delivery = await sendPasswordResetEmail(email, resetToken.resetUrl);

    await logActivity({
      userId: user.id,
      action: activityActions.passwordResetRequested,
      targetId: user.id
    });

    return ok({
      message: resetRequestMessage,
      resetUrl: delivery.sent || !isDevelopmentResetLinkVisible() ? undefined : resetToken.resetUrl
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
