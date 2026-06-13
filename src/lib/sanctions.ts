import { MemberSanctionStatus, MemberSanctionType } from "@prisma/client";

import { ApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export async function getActiveSanctionTypes(userId: string) {
  const now = new Date();
  const sanctions = await prisma.memberSanction.findMany({
    where: {
      userId,
      status: MemberSanctionStatus.ACTIVE,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }]
    },
    select: { type: true }
  });

  return new Set(sanctions.map((sanction) => sanction.type));
}

export async function requireNoSanction(userId: string, types: MemberSanctionType[], message: string) {
  const active = await getActiveSanctionTypes(userId);
  if (types.some((type) => active.has(type))) {
    throw new ApiError(403, message);
  }
}
