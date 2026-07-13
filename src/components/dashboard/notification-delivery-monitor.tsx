"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, Loader2, Mail, MessageCircle, Smartphone, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

type DeliveryEvent = {
  id: string;
  channel: "IN_APP" | "EMAIL" | "PUSH" | "WHATSAPP";
  status: "PENDING" | "DELIVERED" | "FAILED" | "BLOCKED" | "SKIPPED";
  provider: string | null;
  providerMessageId: string | null;
  error: string | null;
  blockedReason: string | null;
  attemptedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  user: {
    name: string | null;
    email: string | null;
  };
  notification: {
    title: string;
    type: string;
    priority: string;
    href: string | null;
    createdAt: string;
  } | null;
};

type DeliveryPayload = {
  events: DeliveryEvent[];
  grouped: Array<{ channel: DeliveryEvent["channel"]; status: DeliveryEvent["status"]; count: number }>;
  totals: {
    notifications: number;
    pendingNotifications: number;
    events: number;
  };
};

const channelIcon = {
  IN_APP: Activity,
  EMAIL: Mail,
  PUSH: Smartphone,
  WHATSAPP: MessageCircle
};

const statusClassName = {
  PENDING: "bg-wheat",
  DELIVERED: "bg-mint",
  FAILED: "bg-clay/10 text-clay",
  BLOCKED: "bg-paper",
  SKIPPED: "bg-paper"
};

function statusIcon(status: DeliveryEvent["status"]) {
  if (status === "DELIVERED") return CheckCircle2;
  if (status === "FAILED") return XCircle;
  if (status === "BLOCKED") return AlertTriangle;
  return Clock3;
}

export function NotificationDeliveryMonitor() {
  const [data, setData] = useState<DeliveryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const response = await fetch("/api/admin/notification-delivery", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as DeliveryPayload & { error?: string } | null;
    setLoading(false);
    if (!response.ok || !payload) {
      setError(payload?.error ?? "Could not load delivery monitor.");
      return;
    }
    setData(payload);
  }

  useEffect(() => {
    void load();
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of data?.grouped ?? []) {
      map.set(`${item.channel}:${item.status}`, item.count);
    }
    return map;
  }, [data]);

  return (
    <section className="rounded-lg border border-ink/10 bg-white shadow-soft">
      <div className="flex flex-col gap-3 border-b border-ink/10 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-moss">
            <Activity className="h-4 w-4" />
            Notification delivery monitor
          </p>
          <h2 className="mt-2 text-xl font-semibold text-ink">Email, WhatsApp, app, and push delivery</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-ink/60">
            Track delivered, failed, pending, blocked, and skipped delivery attempts across LETW communication channels.
          </p>
        </div>
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Activity className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {error ? <p className="mx-5 mt-5 rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}

      <div className="grid gap-3 border-b border-ink/10 p-5 md:grid-cols-4">
        {(["IN_APP", "EMAIL", "PUSH", "WHATSAPP"] as const).map((channel) => {
          const Icon = channelIcon[channel];
          return (
            <div key={channel} className="rounded-lg border border-ink/10 bg-paper p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Icon className="h-4 w-4 text-moss" />
                {channel.toLowerCase().replace("_", " ")}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge className="bg-mint">{grouped.get(`${channel}:DELIVERED`) ?? 0} delivered</Badge>
                <Badge className="bg-wheat">{grouped.get(`${channel}:PENDING`) ?? 0} pending</Badge>
                <Badge className="bg-clay/10 text-clay">{grouped.get(`${channel}:FAILED`) ?? 0} failed</Badge>
                <Badge className="bg-white">{(grouped.get(`${channel}:BLOCKED`) ?? 0) + (grouped.get(`${channel}:SKIPPED`) ?? 0)} blocked/skipped</Badge>
              </div>
            </div>
          );
        })}
      </div>

      <div className="divide-y divide-ink/10">
        {loading && !data ? <p className="p-8 text-sm text-ink/55">Loading delivery history...</p> : null}
        {!loading && data?.events.length === 0 ? <p className="p-8 text-sm text-ink/55">No delivery events recorded yet.</p> : null}
        {data?.events.map((event) => {
          const Icon = channelIcon[event.channel];
          const StatusIcon = statusIcon(event.status);
          return (
            <article key={event.id} className="p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Icon className="h-4 w-4 text-moss" />
                    <Badge>{event.channel.toLowerCase()}</Badge>
                    <Badge className={statusClassName[event.status]}>
                      <StatusIcon className="mr-1 h-3 w-3" />
                      {event.status.toLowerCase()}
                    </Badge>
                    {event.provider ? <Badge className="bg-paper">{event.provider}</Badge> : null}
                  </div>
                  <p className="mt-2 text-sm font-semibold text-ink">{event.notification?.title ?? "Delivery event"}</p>
                  <p className="mt-1 text-xs text-ink/55">
                    To {event.user.name ?? event.user.email ?? "member"} - {formatDate(event.createdAt)}
                  </p>
                  {event.error || event.blockedReason ? (
                    <p className="mt-2 rounded-md bg-paper px-3 py-2 text-xs leading-5 text-ink/65">
                      {event.error ?? event.blockedReason}
                    </p>
                  ) : null}
                </div>
                <div className="text-xs text-ink/50 lg:text-right">
                  {event.attemptedAt ? <p>Attempted {formatDate(event.attemptedAt)}</p> : null}
                  {event.deliveredAt ? <p>Delivered {formatDate(event.deliveredAt)}</p> : null}
                  {event.providerMessageId ? <p className="max-w-xs truncate">ID {event.providerMessageId}</p> : null}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
