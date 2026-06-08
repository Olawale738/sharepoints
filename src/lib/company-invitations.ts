import { getValidatedEmailFrom, hasEmailDeliveryConfig } from "@/lib/email-delivery";
import { requireAnyWorkspaceAdmin } from "@/lib/rbac";

export async function requireCompanyInvitationAdmin(userId: string) {
  await requireAnyWorkspaceAdmin(userId, "Only workspace admins can manage access invitations.");
}

export function getCompanyInvitationUrl(email: string) {
  const baseUrl = (process.env.AUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${baseUrl}/register?email=${encodeURIComponent(email)}`;
}

export function isEmailDeliveryConfigured() {
  return hasEmailDeliveryConfig();
}

export async function sendCompanyInvitationEmail(input: {
  email: string;
  invitedBy?: string | null;
  invitationUrl: string;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = getValidatedEmailFrom();

  if (!apiKey || !from) {
    return { sent: false, reason: "email_not_configured" as const };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: input.email,
      subject: "You are invited to LETW Collaboration",
      text: `You have been invited to join LETW Collaboration${
        input.invitedBy ? ` by ${input.invitedBy}` : ""
      }.\n\nCreate your account here:\n${input.invitationUrl}\n\nOnly invited @letw.org accounts can use the service.`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#18342d">
          <h1 style="font-size:22px">You are invited to LETW Collaboration</h1>
          <p>You have been invited${input.invitedBy ? ` by ${input.invitedBy}` : ""} to create your LETW account.</p>
          <p>
            <a href="${input.invitationUrl}" style="display:inline-block;background:#1f6a57;color:#ffffff;padding:12px 18px;border-radius:6px;text-decoration:none">
              Create account
            </a>
          </p>
          <p>If the button does not work, copy and paste this link into your browser:</p>
          <p style="word-break:break-all">${input.invitationUrl}</p>
          <p>Only invited @letw.org accounts can use the service.</p>
        </div>
      `
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Invitation email failed: ${details}`);
  }

  return { sent: true, reason: null };
}

export const companyInvitationInclude = {
  invitedBy: {
    select: {
      name: true,
      email: true
    }
  },
  acceptedBy: {
    select: {
      name: true,
      email: true
    }
  }
};
