import { activityActions, logActivity } from "@/lib/activity";
import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import {
  companyInvitationInclude,
  getCompanyInvitationUrl,
  requireCompanyInvitationAdmin,
  sendCompanyInvitationEmail
} from "@/lib/company-invitations";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const user = await requireUser();
    await requireCompanyInvitationAdmin(user.id);

    const { id } = await context.params;
    const invitation = await prisma.companyEmailInvitation.findUnique({
      where: { id },
      include: companyInvitationInclude
    });

    if (!invitation) {
      throw new ApiError(404, "Access invitation not found.");
    }

    if (invitation.revokedAt) {
      throw new ApiError(409, "Revoked invitations cannot be resent. Re-invite the email first.");
    }

    if (invitation.acceptedAt) {
      throw new ApiError(409, "This invitation has already been accepted.");
    }

    const invitationUrl = getCompanyInvitationUrl(invitation.email);
    let emailSent = false;

    try {
      const delivery = await sendCompanyInvitationEmail({
        email: invitation.email,
        invitedBy: user.name ?? user.email,
        invitationUrl
      });
      emailSent = delivery.sent;
    } catch {
      throw new ApiError(
        502,
        "Invitation was found, but the email could not be delivered. Check RESEND_API_KEY, EMAIL_FROM, and Resend domain verification."
      );
    }

    await logActivity({
      userId: user.id,
      action: activityActions.companyInvitationResent,
      targetId: invitation.id,
      metadata: {
        email: invitation.email,
        emailSent
      }
    });

    return ok({
      invitation,
      invitationUrl,
      emailSent,
      message: emailSent
        ? `Invitation email resent to ${invitation.email}.`
        : `${invitation.email} is still invited, but email delivery is not configured. Copy the invitation link instead.`
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
