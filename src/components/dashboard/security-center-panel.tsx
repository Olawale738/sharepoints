"use client";

import { Loader2, Search, ShieldAlert, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
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

  async function clearSecurityHistory() {
    const confirmation = window.prompt('Type "CLEAR SECURITY HISTORY" to clear all security history.');
    if (confirmation !== "CLEAR SECURITY HISTORY") return;

    setBusy(true);
    setMessage("");
    setError("");
    const response = await fetch("/api/admin/security-events", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation })
    });
    const body = (await response.json().catch(() => null)) as { count?: number; error?: string } | null;
    setBusy(false);

    if (!response.ok) {
      setError(body?.error ?? "Security history could not be cleared.");
      return;
    }

    setMessage(`${body?.count ?? 0} security events cleared.`);
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-ink/10 bg-white">
      <div className="flex flex-col gap-3 border-b border-ink/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-moss" />
          <h2 className="text-sm font-semibold">Security history</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{events.length}</Badge>
          <Button className="h-9" disabled={busy || events.length === 0} variant="danger" onClick={clearSecurityHistory}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Clear security history
          </Button>
        </div>
      </div>
      {message ? <p className="border-b border-moss/10 bg-mint px-4 py-2 text-xs font-medium text-moss">{message}</p> : null}
      {error ? <p className="border-b border-clay/10 bg-clay/10 px-4 py-2 text-xs font-medium text-clay">{error}</p> : null}
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
