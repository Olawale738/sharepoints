"use client";

import Link from "next/link";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type CalendarEvent = {
  id: string;
  type: "meeting" | "task";
  title: string;
  workspace: string;
  workspaceId: string;
  startsAt: string;
  endsAt?: string | null;
  detail?: string | null;
};

function sameDay(left: Date, right: Date) {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth() && left.getDate() === right.getDate();
}

export function UnifiedCalendar({ events }: { events: CalendarEvent[] }) {
  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [cursor, setCursor] = useState(new Date());
  const visibleDays = useMemo(() => {
    if (view === "day") return [new Date(cursor)];
    if (view === "week") {
      const start = new Date(cursor);
      start.setDate(cursor.getDate() - cursor.getDay());
      return Array.from({ length: 7 }, (_, index) => {
        const day = new Date(start);
        day.setDate(start.getDate() + index);
        return day;
      });
    }

    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const gridStart = new Date(first);
    gridStart.setDate(1 - first.getDay());
    return Array.from({ length: 42 }, (_, index) => {
      const day = new Date(gridStart);
      day.setDate(gridStart.getDate() + index);
      return day;
    });
  }, [cursor, view]);

  function move(direction: number) {
    const next = new Date(cursor);

    if (view === "month") next.setMonth(next.getMonth() + direction);
    if (view === "week") next.setDate(next.getDate() + direction * 7);
    if (view === "day") next.setDate(next.getDate() + direction);
    setCursor(next);
  }

  return (
    <section className="overflow-hidden rounded-lg border border-ink/10 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-moss" />
          <h2 className="font-semibold">
            {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric", ...(view === "day" ? { day: "numeric" } : {}) })}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <Button className="h-9 w-9 px-0" variant="secondary" onClick={() => move(-1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button className="h-9" variant="secondary" onClick={() => setCursor(new Date())}>Today</Button>
          <Button className="h-9 w-9 px-0" variant="secondary" onClick={() => move(1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div className="flex rounded-md border border-ink/10 bg-paper p-1">
            {(["month", "week", "day"] as const).map((item) => (
              <button
                key={item}
                className={`rounded px-3 py-1.5 text-xs font-medium ${view === item ? "bg-moss text-white" : "hover:bg-mint"}`}
                type="button"
                onClick={() => setView(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className={`grid ${view === "day" ? "grid-cols-1" : "grid-cols-7"}`}>
        {visibleDays.map((day) => {
          const dayEvents = events.filter((event) => sameDay(new Date(event.startsAt), day));
          const outsideMonth = view === "month" && day.getMonth() !== cursor.getMonth();

          return (
            <div
              key={day.toISOString()}
              className={`min-h-36 border-b border-r border-ink/10 p-2 ${outsideMonth ? "bg-paper/70 text-ink/35" : ""}`}
            >
              <p className={`mb-2 text-xs font-semibold ${sameDay(day, new Date()) ? "text-moss" : ""}`}>
                {day.toLocaleDateString(undefined, { weekday: view === "day" ? "long" : undefined, day: "numeric" })}
              </p>
              <div className="space-y-1">
                {dayEvents.slice(0, view === "day" ? 20 : 4).map((event) => (
                  <Link
                    key={`${event.type}-${event.id}`}
                    className={`block rounded px-2 py-1.5 text-xs ${
                      event.type === "meeting" ? "bg-mint text-ink" : "bg-wheat text-ink"
                    }`}
                    href={`/dashboard/workspaces/${event.workspaceId}`}
                  >
                    <span className="block truncate font-medium">{event.title}</span>
                    <span className="mt-0.5 flex items-center gap-1 opacity-70">
                      <Clock3 className="h-3 w-3" />
                      {new Date(event.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </Link>
                ))}
                {dayEvents.length > 4 && view !== "day" ? <Badge>+{dayEvents.length - 4}</Badge> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
