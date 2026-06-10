"use client";

import { Search, ShieldAlert } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

type SecurityEvent = {
  id: string;
  type: string;
  email?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  user?: {
    name?: string | null;
    email?: string | null;
  } | null;
};

type SecurityCenterPanelProps = {
  events: SecurityEvent[];
};

const warningEvents = new Set(["LOGIN_FAILED", "SESSION_REVOKED", "FORCE_PASSWORD_RESET", "USER_SUSPENDED", "ACCESS_REVOKED", "USER_DELETED"]);

export function SecurityCenterPanel({ events }: SecurityCenterPanelProps) {
  const [query, setQuery] = useState("");
  const visibleEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return events;
    }

    return events.filter((event) =>
      [event.type, event.email ?? "", event.user?.name ?? "", event.user?.email ?? "", event.ipAddress ?? "", event.userAgent ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [events, query]);

  return (
    <section className="rounded-lg border border-ink/10 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-moss" />
          <h2 className="text-sm font-semibold">Security history</h2>
        </div>
        <Badge>{events.length}</Badge>
      </div>
      <div className="border-b border-ink/10 bg-paper px-4 py-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
          <Input
            className="bg-white pl-9"
            placeholder="Search login history, failed attempts, session revokes..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>
      <div className="divide-y divide-ink/10">
        {visibleEvents.length === 0 ? <p className="px-4 py-8 text-sm text-ink/55">No security events found.</p> : null}
        {visibleEvents.map((event) => (
          <div key={event.id} className="px-4 py-3 text-sm">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="truncate font-medium text-ink">{event.user?.name ?? event.email ?? event.user?.email ?? "Unknown account"}</p>
                <p className="mt-1 truncate text-xs text-ink/50">
                  {event.ipAddress ?? "No IP"} - {event.userAgent ?? "No user agent"}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                <Badge className={warningEvents.has(event.type) ? "bg-wheat" : "bg-mint"}>
                  {event.type.toLowerCase().replaceAll("_", " ")}
                </Badge>
                <span className="text-xs text-ink/45">{formatDate(event.createdAt)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
