import { NotificationDeliveryChannel, NotificationDeliveryStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type DeliveryEventInput = {
  notificationId?: string | null;
  userId: string;
  channel: NotificationDeliveryChannel;
  status: NotificationDeliveryStatus;
  provider?: string | null;
  providerMessageId?: string | null;
  error?: string | null;
  blockedReason?: string | null;
  attemptedAt?: Date | null;
  deliveredAt?: Date | null;
};

export async function recordNotificationDeliveryEvent(input: DeliveryEventInput) {
  return prisma.notificationDeliveryEvent.create({
    data: {
      notificationId: input.notificationId ?? null,
      userId: input.userId,
      channel: input.channel,
      status: input.status,
      provider: input.provider ?? null,
      providerMessageId: input.providerMessageId ?? null,
      error: input.error ?? null,
      blockedReason: input.blockedReason ?? null,
      attemptedAt: input.attemptedAt ?? null,
      deliveredAt: input.deliveredAt ?? null
    }
  });
}

export async function recordNotificationDeliveryEvents(inputs: DeliveryEventInput[]) {
  if (!inputs.length) return { count: 0 };

  return prisma.notificationDeliveryEvent.createMany({
    data: inputs.map((input) => ({
      notificationId: input.notificationId ?? null,
      userId: input.userId,
      channel: input.channel,
      status: input.status,
      provider: input.provider ?? null,
      providerMessageId: input.providerMessageId ?? null,
      error: input.error ?? null,
      blockedReason: input.blockedReason ?? null,
      attemptedAt: input.attemptedAt ?? null,
      deliveredAt: input.deliveredAt ?? null
    }))
  });
}
