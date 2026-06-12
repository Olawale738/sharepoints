import { z } from "zod";

import { ApiError, handleRouteError, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const subscriptionSchema = z.object({
  endpoint: z.string().trim().min(10).max(500),
  platform: z.enum(["ios", "android", "web"]),
  deviceName: z.string().trim().max(120).optional()
});

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const parsed = subscriptionSchema.safeParse(await request.json());
    if (!parsed.success) throw new ApiError(422, "Invalid push subscription.");
    const subscription = await prisma.pushSubscription.upsert({
      where: { endpoint: parsed.data.endpoint },
      update: {
        userId: user.id,
        platform: parsed.data.platform,
        deviceName: parsed.data.deviceName ?? null,
        enabled: true
      },
      create: {
        userId: user.id,
        endpoint: parsed.data.endpoint,
        platform: parsed.data.platform,
        deviceName: parsed.data.deviceName ?? null
      }
    });
    return ok({ subscription }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser();
    const endpoint = new URL(request.url).searchParams.get("endpoint");
    if (!endpoint) throw new ApiError(422, "Push endpoint is required.");
    await prisma.pushSubscription.updateMany({
      where: { userId: user.id, endpoint },
      data: { enabled: false }
    });
    return ok({ disabled: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
