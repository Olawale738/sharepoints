import { getValidatedEmailFrom, hasEmailDeliveryConfig } from "@/lib/email-delivery";
import { recordNotificationDeliveryEvent, recordNotificationDeliveryEvents } from "@/lib/notification-delivery-events";
import { prisma } from "@/lib/prisma";
import { NotificationDeliveryChannel, NotificationDeliveryStatus } from "@prisma/client";

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function absoluteHref(href: string | null) {
  if (!href) return null;
  if (/^https?:\/\//i.test(href)) return href;
  const origin = (process.env.AUTH_URL ?? "https://sharepoints.letw.org").replace(/\/$/, "");
  return `${origin}${href.startsWith("/") ? href : `/${href}`}`;
}

function isQuietTime(start: string | null, end: string | null, timeZone: string) {
  if (!start || !end) return false;
  const local = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(new Date());
  if (start < end) return local >= start && local < end;
  return local >= start || local < end;
}

function localSchedule(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  return Object.fromEntries(parts.map((part) => [part.type, part.value])) as {
    weekday?: string;
    hour?: string;
    minute?: string;
  };
}

async function sendEmail(to: string, title: string, body: string | null, href: string | null) {
  if (!hasEmailDeliveryConfig()) return { sent: false, error: "Email delivery is not configured." };
  const from = getValidatedEmailFrom();
  if (!from) return { sent: false, error: "The configured email sender is invalid." };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: title,
      html: `<p>${escapeHtml(body ?? title)}</p>${
        href ? `<p><a href="${escapeHtml(href)}">Open in LETW</a></p>` : ""
      }`
    })
  });
  if (response.ok) {
    return { sent: true, error: null };
  }

  return { sent: false, error: await response.text().catch(() => `Email request failed with HTTP ${response.status}.`) };
}

async function sendDigest(
  to: string,
  cadence: string,
  notifications: Array<{ title: string; body: string | null; href: string | null }>
) {
  if (!hasEmailDeliveryConfig() || !notifications.length) return false;
  const from = getValidatedEmailFrom();
  if (!from) return false;
  const items = notifications
    .map(
      (notification) =>
        `<li><strong>${escapeHtml(notification.title)}</strong>${
          notification.body ? `<br>${escapeHtml(notification.body)}` : ""
        }${
          notification.href ? ` <a href="${escapeHtml(notification.href)}">Open</a>` : ""
        }</li>`
    )
    .join("");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `Your LETW ${cadence.toLowerCase()} digest`,
      html: `<p>${notifications.length} LETW updates are waiting for you.</p><ul>${items}</ul>`
    })
  });
  return response.ok;
}

async function sendPush(tokens: string[], title: string, body: string | null, href: string | null) {
  if (!tokens.length) return { sent: false, error: "No enabled push subscriptions." };
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-encoding": "gzip, deflate",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(
      tokens.map((to) => ({
        to,
        title,
        body: body ?? "Open LETW to view this update.",
        data: { href },
        sound: "default",
        priority: "high"
      }))
    )
  });
  if (response.ok) {
    return { sent: true, error: null };
  }

  return { sent: false, error: await response.text().catch(() => `Push request failed with HTTP ${response.status}.`) };
}

export async function deliverPendingNotifications(notificationIds?: string[]) {
  const notifications = await prisma.notification.findMany({
    where: {
      AND: [
        ...(notificationIds?.length ? [{ id: { in: notificationIds } }] : []),
        { OR: [{ deliverAt: null }, { deliverAt: { lte: new Date() } }] },
        { OR: [{ deliveredAt: null }, { emailSentAt: null }, { pushSentAt: null }] }
      ]
    },
    include: {
      user: {
        select: {
          email: true,
          notificationPreference: true
        }
      }
    },
    orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    take: notificationIds?.length ? Math.min(notificationIds.length, 500) : 200
  });
  let delivered = 0;
  const byUser = new Map<string, typeof notifications>();

  for (const notification of notifications) {
    byUser.set(notification.userId, [...(byUser.get(notification.userId) ?? []), notification]);
  }

  for (const userNotifications of byUser.values()) {
    const first = userNotifications[0];
    if (!first) continue;
    const preference = first.user.notificationPreference;
    const quiet = Boolean(
      preference &&
        isQuietTime(preference.quietHoursStart, preference.quietHoursEnd, preference.timeZone)
    );

    for (const notification of userNotifications) {
      if (quiet && notification.priority !== "URGENT") {
        await recordNotificationDeliveryEvents([
          {
            notificationId: notification.id,
            userId: notification.userId,
            channel: NotificationDeliveryChannel.PUSH,
            status: NotificationDeliveryStatus.BLOCKED,
            provider: "LETW_QUIET_HOURS",
            blockedReason: "User quiet hours are active."
          },
          {
            notificationId: notification.id,
            userId: notification.userId,
            channel: NotificationDeliveryChannel.EMAIL,
            status: NotificationDeliveryStatus.BLOCKED,
            provider: "LETW_QUIET_HOURS",
            blockedReason: "User quiet hours are active."
          }
        ]);
        continue;
      }

      let pushSent = false;
      if (!notification.pushSentAt) {
        if (!preference?.pushEnabled) {
          await recordNotificationDeliveryEvent({
            notificationId: notification.id,
            userId: notification.userId,
            channel: NotificationDeliveryChannel.PUSH,
            status: NotificationDeliveryStatus.BLOCKED,
            provider: "EXPO",
            blockedReason: "Push notifications are disabled for this user."
          });
        } else {
          const subscriptions = await prisma.pushSubscription.findMany({
            where: { userId: notification.userId, enabled: true },
            select: { endpoint: true }
          });
          const pushResult = await sendPush(
            subscriptions.map((subscription) => subscription.endpoint),
            notification.title,
            notification.body,
            absoluteHref(notification.href)
          );
          pushSent = pushResult.sent;
          await recordNotificationDeliveryEvent({
            notificationId: notification.id,
            userId: notification.userId,
            channel: NotificationDeliveryChannel.PUSH,
            status: pushResult.sent
              ? NotificationDeliveryStatus.DELIVERED
              : subscriptions.length
                ? NotificationDeliveryStatus.FAILED
                : NotificationDeliveryStatus.SKIPPED,
            provider: "EXPO",
            error: pushResult.error,
            attemptedAt: new Date(),
            deliveredAt: pushResult.sent ? new Date() : null
          });
        }
      }

      let emailSent = false;
      if ((notification.priority === "URGENT" || preference?.digest === "IMMEDIATE") && notification.user.email && !notification.emailSentAt) {
        const emailResult = await sendEmail(
          notification.user.email,
          notification.title,
          notification.body,
          absoluteHref(notification.href)
        );
        emailSent = emailResult.sent;
        await recordNotificationDeliveryEvent({
          notificationId: notification.id,
          userId: notification.userId,
          channel: NotificationDeliveryChannel.EMAIL,
          status: emailResult.sent ? NotificationDeliveryStatus.DELIVERED : NotificationDeliveryStatus.FAILED,
          provider: "RESEND",
          error: emailResult.error,
          attemptedAt: new Date(),
          deliveredAt: emailResult.sent ? new Date() : null
        });
      } else if (!notification.emailSentAt && preference?.digest === "NEVER") {
        await recordNotificationDeliveryEvent({
          notificationId: notification.id,
          userId: notification.userId,
          channel: NotificationDeliveryChannel.EMAIL,
          status: NotificationDeliveryStatus.BLOCKED,
          provider: "RESEND",
          blockedReason: "Email digest is disabled for this user."
        });
      } else if (!notification.emailSentAt) {
        await recordNotificationDeliveryEvent({
          notificationId: notification.id,
          userId: notification.userId,
          channel: NotificationDeliveryChannel.EMAIL,
          status: NotificationDeliveryStatus.PENDING,
          provider: "RESEND",
          blockedReason: "Waiting for digest schedule or immediate email condition."
        });
      }
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          deliveredAt: notification.deliveredAt ?? new Date(),
          pushSentAt: pushSent ? new Date() : notification.pushSentAt,
          emailSentAt:
            emailSent || preference?.digest === "NEVER" ? new Date() : notification.emailSentAt
        }
      });
      delivered += 1;
    }

    if (!preference || !first.user.email || !["DAILY", "WEEKLY"].includes(preference.digest)) continue;
    const schedule = localSchedule(preference.timeZone);
    const digestDue =
      schedule.hour === "08" &&
      Number(schedule.minute ?? "99") < 10 &&
      (preference.digest === "DAILY" || schedule.weekday === "Mon");
    const pendingDigest = userNotifications.filter((notification) => !notification.emailSentAt);
    if (digestDue && pendingDigest.length) {
      const sent = await sendDigest(
        first.user.email,
        preference.digest,
        pendingDigest.map((notification) => ({
          title: notification.title,
          body: notification.body,
          href: absoluteHref(notification.href)
        }))
      );
      if (sent) {
        await prisma.notification.updateMany({
          where: { id: { in: pendingDigest.map((notification) => notification.id) } },
          data: { emailSentAt: new Date() }
        });
        await recordNotificationDeliveryEvents(
          pendingDigest.map((notification) => ({
            notificationId: notification.id,
            userId: notification.userId,
            channel: NotificationDeliveryChannel.EMAIL,
            status: NotificationDeliveryStatus.DELIVERED,
            provider: "RESEND_DIGEST",
            attemptedAt: new Date(),
            deliveredAt: new Date()
          }))
        );
      }
    }
  }

  return { delivered, scanned: notifications.length };
}
