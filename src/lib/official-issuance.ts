import { activityActions, logActivity } from "@/lib/activity";
import { ApiError } from "@/lib/api";
import { isPresidentDocumentAuthority } from "@/lib/governance";
import { assertEmergencyLockdownAllows } from "@/lib/president-controls";
import { prisma } from "@/lib/prisma";

type OfficialIssuanceInput = {
  userId: string;
  canIssueCertificates: boolean;
  canIssueAcademicCertificates: boolean;
  canManageSchoolAcademics: boolean;
  canIssueIdCards: boolean;
  canIssueLetters: boolean;
  expiresAt?: Date | null;
  reason?: string | null;
};

function isActiveGrant(grant: { revokedAt?: Date | null; expiresAt?: Date | null } | null | undefined) {
  return Boolean(grant && !grant.revokedAt && (!grant.expiresAt || grant.expiresAt > new Date()));
}

export async function getOfficialIssuanceAuthority(userId: string) {
  const isPresident = await isPresidentDocumentAuthority(userId);
  if (isPresident) {
    return {
      isPresident: true,
      canIssueCertificates: true,
      canIssueAcademicCertificates: true,
      canManageSchoolAcademics: true,
      canIssueIdCards: true,
      canIssueLetters: true,
      grant: null
    };
  }

  const grant = await prisma.officialIssuanceGrant.findUnique({
    where: { userId },
    select: {
      id: true,
      canIssueCertificates: true,
      canIssueAcademicCertificates: true,
      canManageSchoolAcademics: true,
      canIssueIdCards: true,
      canIssueLetters: true,
      expiresAt: true,
      revokedAt: true,
      reason: true
    }
  });
  const active = isActiveGrant(grant);

  return {
    isPresident: false,
    canIssueCertificates: Boolean(active && grant?.canIssueCertificates),
    canIssueAcademicCertificates: Boolean(active && grant?.canIssueAcademicCertificates),
    canManageSchoolAcademics: Boolean(active && (grant?.canManageSchoolAcademics || grant?.canIssueAcademicCertificates)),
    canIssueIdCards: Boolean(active && grant?.canIssueIdCards),
    canIssueLetters: Boolean(active && grant?.canIssueLetters),
    grant
  };
}

export async function requirePresidentIssuanceAuthority(actorId: string) {
  if (!(await isPresidentDocumentAuthority(actorId))) {
    throw new ApiError(403, "Only the LETW president can grant or revoke official issuing authority.");
  }
}

export async function requireCertificateIssuer(actorId: string) {
  await assertEmergencyLockdownAllows("OFFICIAL_ISSUING", actorId);
  const authority = await getOfficialIssuanceAuthority(actorId);
  if (!authority.canIssueCertificates) {
    throw new ApiError(403, "Only the LETW president or a president-approved certificate issuer can issue certificates.");
  }
  return authority;
}

export async function requireAcademicCertificateIssuer(actorId: string) {
  await assertEmergencyLockdownAllows("OFFICIAL_ISSUING", actorId);
  const authority = await getOfficialIssuanceAuthority(actorId);
  if (!authority.canIssueAcademicCertificates) {
    throw new ApiError(403, "Only the LETW president or a president-assigned rector can issue academic theology certificates.");
  }
  return authority;
}

export async function requireSchoolAcademicManager(actorId: string) {
  const authority = await getOfficialIssuanceAuthority(actorId);
  if (!authority.canManageSchoolAcademics) {
    throw new ApiError(403, "Only the LETW president, an assigned rector, or a president-approved school secretary can manage theology school admissions.");
  }
  return authority;
}

export async function requireIdCardIssuer(actorId: string) {
  await assertEmergencyLockdownAllows("OFFICIAL_ISSUING", actorId);
  const authority = await getOfficialIssuanceAuthority(actorId);
  if (!authority.canIssueIdCards) {
    throw new ApiError(403, "Only the LETW president or a president-approved ID-card issuer can issue or reissue digital IDs.");
  }
  return authority;
}

export async function requireOfficialLetterIssuer(actorId: string) {
  await assertEmergencyLockdownAllows("OFFICIAL_ISSUING", actorId);
  const authority = await getOfficialIssuanceAuthority(actorId);
  if (!authority.canIssueLetters) {
    throw new ApiError(403, "Only the LETW president or a president-approved letter issuer can issue official LETW letters.");
  }
  return authority;
}

export async function listOfficialIssuanceCenter(actorId: string) {
  await requirePresidentIssuanceAuthority(actorId);
  const [users, grants] = await Promise.all([
    prisma.user.findMany({
      where: {
        deletedAt: null,
        suspendedAt: null,
        accessRevokedAt: null,
        email: { endsWith: "@letw.org" }
      },
      select: {
        id: true,
        name: true,
        email: true,
        category: true,
        memberProfile: { select: { organizationPosition: true, membershipNumber: true } },
        workspaceMemberships: {
          select: {
            role: true,
            workspace: { select: { id: true, name: true } }
          },
          take: 12
        }
      },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      take: 1000
    }),
    prisma.officialIssuanceGrant.findMany({
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            category: true,
            memberProfile: { select: { organizationPosition: true, membershipNumber: true } }
          }
        },
        grantedBy: { select: { id: true, name: true, email: true } }
      },
      orderBy: { updatedAt: "desc" },
      take: 1000
    })
  ]);

  return {
    users,
    grants: grants.map((grant) => ({
      ...grant,
      active: isActiveGrant(grant)
    }))
  };
}

export async function grantOfficialIssuanceAuthority(actorId: string, input: OfficialIssuanceInput) {
  await requirePresidentIssuanceAuthority(actorId);
  const target = await prisma.user.findFirst({
    where: {
      id: input.userId,
      deletedAt: null,
      suspendedAt: null,
      accessRevokedAt: null,
      email: { endsWith: "@letw.org" }
    },
    select: { id: true, email: true, name: true }
  });
  if (!target) throw new ApiError(404, "The selected LETW user was not found or is inactive.");

  if (!input.canIssueCertificates && !input.canIssueAcademicCertificates && !input.canManageSchoolAcademics && !input.canIssueIdCards && !input.canIssueLetters) {
    throw new ApiError(422, "Select at least one issuing permission.");
  }

  const grant = await prisma.officialIssuanceGrant.upsert({
    where: { userId: target.id },
    create: {
      userId: target.id,
      grantedById: actorId,
      canIssueCertificates: input.canIssueCertificates,
      canIssueAcademicCertificates: input.canIssueAcademicCertificates,
      canManageSchoolAcademics: input.canManageSchoolAcademics || input.canIssueAcademicCertificates,
      canIssueIdCards: input.canIssueIdCards,
      canIssueLetters: input.canIssueLetters,
      expiresAt: input.expiresAt ?? null,
      reason: input.reason ?? null
    },
    update: {
      grantedById: actorId,
      canIssueCertificates: input.canIssueCertificates,
      canIssueAcademicCertificates: input.canIssueAcademicCertificates,
      canManageSchoolAcademics: input.canManageSchoolAcademics || input.canIssueAcademicCertificates,
      canIssueIdCards: input.canIssueIdCards,
      canIssueLetters: input.canIssueLetters,
      expiresAt: input.expiresAt ?? null,
      reason: input.reason ?? null,
      revokedAt: null,
      revokedById: null
    }
  });

  await logActivity({
    userId: actorId,
    action: activityActions.officialIssuanceGranted,
    targetId: grant.id,
    metadata: {
      targetUserId: target.id,
      targetEmail: target.email,
      canIssueCertificates: grant.canIssueCertificates,
      canIssueAcademicCertificates: grant.canIssueAcademicCertificates,
      canManageSchoolAcademics: grant.canManageSchoolAcademics,
      canIssueIdCards: grant.canIssueIdCards,
      canIssueLetters: grant.canIssueLetters,
      expiresAt: grant.expiresAt?.toISOString() ?? null
    }
  });

  return grant;
}

export async function revokeOfficialIssuanceAuthority(actorId: string, userId: string) {
  await requirePresidentIssuanceAuthority(actorId);
  const grant = await prisma.officialIssuanceGrant.findUnique({ where: { userId } });
  if (!grant) throw new ApiError(404, "No official issuing authority grant was found for this user.");

  const revoked = await prisma.officialIssuanceGrant.update({
    where: { userId },
    data: {
      revokedAt: new Date(),
      revokedById: actorId,
      canIssueCertificates: false,
      canIssueAcademicCertificates: false,
      canManageSchoolAcademics: false,
      canIssueIdCards: false,
      canIssueLetters: false
    }
  });

  await logActivity({
    userId: actorId,
    action: activityActions.officialIssuanceRevoked,
    targetId: revoked.id,
    metadata: { targetUserId: userId }
  });

  return revoked;
}
