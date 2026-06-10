import type { Prisma, SecurityEventType } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function logSecurityEvent(input: {
  userId?: string | null;
  type: SecurityEventType;
  email?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Prisma.InputJsonObject;
}) {
  return prisma.securityEvent.create({
    data: {
      userId: input.userId ?? null,
      type: input.type,
      email: input.email?.toLowerCase() ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      metadata: input.metadata
    }
  });
}
