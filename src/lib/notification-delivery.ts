import { getValidatedEmailFrom, hasEmailDeliveryConfig } from "@/lib/email-delivery";
import { prisma } from "@/lib/prisma";

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
  if (!hasEmailDeliveryConfig()) return false;
  const from = getValidatedEmailFrom();
  if (!from) return false;
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
  return response.ok;
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
  if (!tokens.length) return false;
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
  return response.ok;
}

export async function deliverPendingNotifications() {
  const notifications = await prisma.notification.findMany({
    where: {
      AND: [
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
    take: 200
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
      if (quiet && notification.priority !== "URGENT") continue;
      const subscriptions = preference?.pushEnabled && !notification.pushSentAt
        ? await prisma.pushSubscription.findMany({
            where: { userId: notification.userId, enabled: true },
            select: { endpoint: true }
          })
        : [];
      await sendPush(
        subscriptions.map((subscription) => subscription.endpoint),
        notification.title,
        notification.body,
        notification.href
      );
      let emailSent = false;
      if (preference?.digest === "IMMEDIATE" && notification.user.email && !notification.emailSentAt) {
        emailSent = await sendEmail(
          notification.user.email,
          notification.title,
          notification.body,
          notification.href
        );
      }
      await prisma.notification.update({
        where: { id: notification.id },
        data: {
          deliveredAt: notification.deliveredAt ?? new Date(),
          pushSentAt: notification.pushSentAt ?? new Date(),
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
          href: notification.href
        }))
      );
      if (sent) {
        await prisma.notification.updateMany({
          where: { id: { in: pendingDigest.map((notification) => notification.id) } },
          data: { emailSentAt: new Date() }
        });
      }
    }
  }

  return { delivered, scanned: notifications.length };
}
