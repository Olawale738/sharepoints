import { prisma } from "@/lib/prisma";
import { isUserAccessBlocked } from "@/lib/user-access";

export function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? "";
}

export function isCompanyDomainEmail(email?: string | null) {
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail) {
    return false;
  }

  return normalizedEmail.endsWith("@letw.org");
}

export async function hasCompanyEmailInvitation(email?: string | null) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !isCompanyDomainEmail(normalizedEmail)) {
    return false;
  }

  const invitation = await prisma.companyEmailInvitation.findUnique({
    where: {
      email: normalizedEmail
    },
    select: {
      revokedAt: true
    }
  });

  return Boolean(invitation && !invitation.revokedAt);
}

export async function isBlockedSelfRegistrationEmail(email?: string | null) {
  return !(await hasCompanyEmailInvitation(email));
}

export async function isBlockedServiceEmail(email?: string | null, userId?: string | null) {
  if (await isUserAccessBlocked({ email: normalizeEmail(email), userId })) {
    return true;
  }

  return !(await hasCompanyEmailInvitation(email));
}

export async function markCompanyInvitationAccepted(email: string | null | undefined, userId: string) {
  const normalizedEmail = normalizeEmail(email);

  if (!normalizedEmail || !isCompanyDomainEmail(normalizedEmail)) {
    return;
  }

  await prisma.companyEmailInvitation.updateMany({
    where: {
      email: normalizedEmail,
      revokedAt: null
    },
    data: {
      acceptedById: userId,
      acceptedAt: new Date()
    }
  });
}

export const blockedSelfRegistrationMessage =
  "LETW access is restricted to invited @letw.org email addresses.";

export const blockedServiceAccessMessage =
  "Only invited @letw.org email addresses can use LETW.";
