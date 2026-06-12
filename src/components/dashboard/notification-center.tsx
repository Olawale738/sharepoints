"use client";

import Link from "next/link";
import { Bell, CheckCheck, Loader2, Settings } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRealtimeScope } from "@/components/dashboard/use-realtime-scope";

type NotificationItem = {
  id: string;
  title: string;
  body?: string | null;
  href?: string | null;
  readAt?: string | null;
  createdAt: string;
};

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [browserEnabled, setBrowserEnabled] = useState(false);
  const [userId, setUserId] = useState("");
  const realtimeStatus = useRealtimeScope("notifications", userId, () => {
    void loadNotifications();
  });

  async function loadNotifications() {
    setLoading(true);
    const response = await fetch("/api/notifications");
    setLoading(false);

    if (!response.ok) {
      return;
    }

    const data = (await response.json()) as {
      notifications: NotificationItem[];
      unreadCount: number;
      preference?: { browserEnabled?: boolean };
      userId: string;
    };
    setNotifications(data.notifications);
    setUnreadCount(data.unreadCount);
    setBrowserEnabled(Boolean(data.preference?.browserEnabled));
    setUserId(data.userId);

    if (
      data.unreadCount &&
      data.preference?.browserEnabled &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      const latest = data.notifications.find((notification) => !notification.readAt);

      if (latest) {
        new Notification(latest.title, { body: latest.body ?? "Open LETW to view the update.", icon: "/letw-logo.png" });
      }
    }
  }

  useEffect(() => {
    loadNotifications();
    if (realtimeStatus !== "fallback") return;
    const interval = window.setInterval(loadNotifications, 30_000);
    return () => window.clearInterval(interval);
  }, [realtimeStatus]);

  async function markAllRead() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "READ_ALL" })
    });
    setNotifications((current) => current.map((notification) => ({ ...notification, readAt: new Date().toISOString() })));
    setUnreadCount(0);
  }

  async function enableBrowserNotifications() {
    if (typeof Notification === "undefined") {
      return;
    }

    const permission = await Notification.requestPermission();
    const enabled = permission === "granted";
    setBrowserEnabled(enabled);
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ browserEnabled: enabled })
    });
  }

  return (
    <div className="relative">
      <button
        aria-label="Notifications"
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-md text-ink transition hover:bg-ink/5"
        type="button"
        onClick={() => {
          setOpen((current) => !current);
          if (!open) loadNotifications();
        }}
      >
        <Bell className="h-4 w-4" />
        {unreadCount ? (
          <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-clay px-1 text-center text-[10px] font-semibold text-white">
            {Math.min(unreadCount, 99)}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="absolute right-0 top-12 z-50 w-[22rem] overflow-hidden rounded-lg border border-ink/10 bg-white shadow-soft">
          <div className="flex items-center justify-between border-b border-ink/10 px-3 py-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">Notifications</p>
              <Badge>{unreadCount}</Badge>
            </div>
            <button
              aria-label="Mark all notifications read"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-moss hover:bg-mint"
              type="button"
              onClick={markAllRead}
            >
              <CheckCheck className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-96 divide-y divide-ink/10 overflow-y-auto">
            {loading && !notifications.length ? (
              <p className="flex items-center gap-2 px-3 py-5 text-sm text-ink/55">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading notifications
              </p>
            ) : null}
            {!loading && !notifications.length ? (
              <p className="px-3 py-8 text-center text-sm text-ink/55">You are all caught up.</p>
            ) : null}
            {notifications.map((notification) => {
              const content = (
                <div className={`px-3 py-3 ${notification.readAt ? "bg-white" : "bg-mint/35"}`}>
                  <p className="text-sm font-medium">{notification.title}</p>
                  {notification.body ? <p className="mt-1 line-clamp-2 text-xs text-ink/55">{notification.body}</p> : null}
                  <p className="mt-1 text-[11px] text-ink/40">{new Date(notification.createdAt).toLocaleString()}</p>
                </div>
              );
              return notification.href ? (
                <Link key={notification.id} href={notification.href} onClick={() => setOpen(false)}>
                  {content}
                </Link>
              ) : (
                <div key={notification.id}>{content}</div>
              );
            })}
          </div>
          <div className="border-t border-ink/10 bg-paper p-2">
            <Button className="w-full" variant="secondary" onClick={enableBrowserNotifications}>
              <Settings className="h-4 w-4" />
              {browserEnabled ? "Browser alerts enabled" : "Enable browser alerts"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
