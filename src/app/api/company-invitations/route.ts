import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import {
  companyInvitationInclude,
  getCompanyInvitationUrl,
  isEmailDeliveryConfigured,
  requireCompanyInvitationAdmin,
  sendCompanyInvitationEmail
} from "@/lib/company-invitations";
import { isCompanyDomainEmail, normalizeEmail } from "@/lib/email-policy";
import { prisma } from "@/lib/prisma";
import { inviteCompanyEmailSchema } from "@/lib/validators";

export async function GET() {
  try {
    const user = await requireUser();
    await requireCompanyInvitationAdmin(user.id);

    const invitations = await prisma.companyEmailInvitation.findMany({
      include: companyInvitationInclude,
      orderBy: {
        createdAt: "desc"
      },
      take: 100
    });

    return ok({ invitations });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    await requireCompanyInvitationAdmin(user.id);

    const body = await request.json();
    const parsed = inviteCompanyEmailSchema.safeParse(body);

    if (!parsed.success) {
      throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid access invitation.");
    }

    const email = normalizeEmail(parsed.data.email);

    if (!isCompanyDomainEmail(email)) {
      throw new ApiError(422, "Only @letw.org email addresses can be invited.");
    }

    if (process.env.NODE_ENV === "production" && !isEmailDeliveryConfigured()) {
      throw new ApiError(503, "Invitation email is not configured. Add RESEND_API_KEY and EMAIL_FROM.");
    }

    const invitation = await prisma.companyEmailInvitation.upsert({
      where: {
        email
      },
      update: {
        invitedById: user.id,
        revokedAt: null
      },
      create: {
        email,
        invitedById: user.id
      },
      include: companyInvitationInclude
    });
    const invitationUrl = getCompanyInvitationUrl(email);
    let emailSent = false;

    try {
      const delivery = await sendCompanyInvitationEmail({
        email,
        invitedBy: user.name ?? user.email,
        invitationUrl
      });
      emailSent = delivery.sent;
    } catch {
      throw new ApiError(
        502,
        "Invitation was saved, but the email could not be delivered. Check RESEND_API_KEY, EMAIL_FROM, and Resend domain verification."
      );
    }

    return ok(
      {
        invitation,
        invitationUrl,
        emailSent,
        message: emailSent
          ? `Invitation email sent to ${email}.`
          : `${email} can now register, but email delivery is not configured. Copy the invitation link instead.`
      },
      { status: 201 }
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
