import { createHash, randomBytes } from "node:crypto";

import { getValidatedEmailFrom } from "@/lib/email-delivery";
import { prisma } from "@/lib/prisma";

const resetExpiryMinutes = 60;

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function getAppBaseUrl() {
  return (process.env.AUTH_URL || process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "");
}

export async function createPasswordResetToken(userId: string, email: string) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashPasswordResetToken(token);
  const expiresAt = new Date(Date.now() + resetExpiryMinutes * 60 * 1000);

  await prisma.passwordResetToken.deleteMany({
    where: {
      userId,
      usedAt: null
    }
  });

  await prisma.passwordResetToken.create({
    data: {
      userId,
      email,
      tokenHash,
      expiresAt
    }
  });

  const resetUrl = `${getAppBaseUrl()}/reset-password?email=${encodeURIComponent(email)}&token=${encodeURIComponent(
    token
  )}`;

  return {
    expiresAt,
    resetUrl,
    token
  };
}

export async function sendPasswordResetEmail(email: string, resetUrl: string) {
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
      to: email,
      subject: "Reset your LETW password",
      text: `Use this link to reset your LETW password. The link expires in ${resetExpiryMinutes} minutes.\n\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`,
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#18342d">
          <h1 style="font-size:22px">Reset your LETW password</h1>
          <p>Use the button below to choose a new password. This link expires in ${resetExpiryMinutes} minutes.</p>
          <p>
            <a href="${resetUrl}" style="display:inline-block;background:#1f6a57;color:#ffffff;padding:12px 18px;border-radius:6px;text-decoration:none">
              Reset password
            </a>
          </p>
          <p>If the button does not work, copy and paste this link into your browser:</p>
          <p style="word-break:break-all">${resetUrl}</p>
          <p>If you did not request this, you can ignore this email.</p>
        </div>
      `
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Password reset email failed: ${details}`);
  }

  return { sent: true, reason: null };
}

export function isDevelopmentResetLinkVisible() {
  return process.env.NODE_ENV !== "production";
}
