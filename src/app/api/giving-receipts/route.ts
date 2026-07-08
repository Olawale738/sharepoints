import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { getLeadershipAccess, issueGivingReceipt } from "@/lib/leadership-suite";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  userId: z.string().cuid().nullable().optional(),
  donorName: z.string().trim().min(2).max(180),
  donorEmail: z.string().email().nullable().optional(),
  donorPhone: z.string().trim().max(40).nullable().optional(),
  amountCents: z.coerce.number().int().min(1),
  currency: z.string().trim().min(3).max(3).default("GBP"),
  fund: z.string().trim().min(2).max(160),
  paymentMethod: z.string().trim().max(80).nullable().optional(),
  receivedAt: z.string().datetime(),
  notes: z.string().trim().max(3000).nullable().optional()
});

export async function GET() {
  try {
    const user = await requireUser();
    const access = await getLeadershipAccess(user.id);
    const ownReceiptFilters = [
      { userId: user.id },
      ...(user.email ? [{ donorEmail: user.email.toLowerCase() }] : [])
    ];
    const receipts = await prisma.givingReceipt.findMany({
      where: access.canUseLeadership
        ? access.isAdmin
          ? {}
          : { OR: [{ issuedById: user.id }, ...ownReceiptFilters] }
        : { OR: ownReceiptFilters },
      orderBy: { receivedAt: "desc" },
      take: access.canUseLeadership ? 200 : 60
    });
    return ok({ receipts, canIssue: access.canUseLeadership });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = createSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, parsed.error.issues[0]?.message ?? "Invalid giving receipt.");
    const receipt = await issueGivingReceipt(user.id, parsed.data);
    return ok({ receipt }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
