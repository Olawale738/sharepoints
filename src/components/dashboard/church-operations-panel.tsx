"use client";

import { FormEvent, useEffect, useState } from "react";
import { CalendarDays, HeartHandshake, Loader2, Plus, UsersRound, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Operations = {
  ministries: Array<{ id: string; name: string; description?: string | null }>;
  events: Array<{ id: string; title: string; eventType: string; startsAt: string; location?: string | null }>;
  attendance: Array<{ id: string; eventId: string; displayName: string; checkedInAt: string }>;
  volunteers: Array<{ id: string; eventId: string; userId: string; role: string; status: string }>;
  followUps: Array<{ id: string; personName: string; reason: string; status: string; nextContactAt?: string | null }>;
  resources: Array<{ id: string; name: string; category: string; location?: string | null }>;
  bookings: Array<{ id: string; resourceId: string; title: string; status: string; startsAt: string; endsAt: string }>;
  users: Array<{ id: string; name?: string | null; email?: string | null }>;
};

const emptyOperations: Operations = {
  ministries: [], events: [], attendance: [], volunteers: [], followUps: [], resources: [], bookings: [], users: []
};

export function ChurchOperationsPanel() {
  const [data, setData] = useState<Operations>(emptyOperations);
  const [mode, setMode] = useState<"MINISTRY" | "EVENT" | "FOLLOW_UP" | "RESOURCE" | "BOOKING">("MINISTRY");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const metrics = [
    { label: "Ministries", value: data.ministries.length, icon: HeartHandshake },
    { label: "Events", value: data.events.length, icon: CalendarDays },
    { label: "Attendance", value: data.attendance.length, icon: UsersRound },
    {
      label: "Follow-ups",
      value: data.followUps.filter((item) => item.status !== "CLOSED").length,
      icon: HeartHandshake
    },
    { label: "Resources", value: data.resources.length, icon: Wrench }
  ];

  async function load() {
    const response = await fetch("/api/church/operations");
    const body = (await response.json().catch(() => null)) as Operations & { error?: string };
    setLoading(false);
    if (!response.ok) {
      setError(body?.error ?? "Church operations could not be loaded.");
      return;
    }
    setData(body);
  }

  useEffect(() => { void load(); }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const payload: Record<string, unknown> = { entity: mode, ...values };
    if (mode === "EVENT" || mode === "BOOKING") {
      payload.startsAt = new Date(String(values.startsAt)).toISOString();
      payload.endsAt = new Date(String(values.endsAt)).toISOString();
    }
    if (mode === "FOLLOW_UP" && values.nextContactAt) {
      payload.nextContactAt = new Date(String(values.nextContactAt)).toISOString();
    }
    const response = await fetch("/api/church/operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setError(body?.error ?? "Record could not be created.");
      return;
    }
    event.currentTarget.reset();
    await load();
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-lg border border-ink/10 bg-white p-4">
            <Icon className="h-5 w-5 text-moss" />
            <p className="mt-3 text-2xl font-semibold">{value}</p>
            <p className="text-sm text-ink/55">{label}</p>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-ink/10 bg-white">
        <div className="flex flex-wrap gap-1 border-b border-ink/10 p-2">
          {(["MINISTRY", "EVENT", "FOLLOW_UP", "RESOURCE", "BOOKING"] as const).map((item) => (
            <button key={item} className={`rounded-md px-3 py-2 text-sm font-medium ${mode === item ? "bg-moss text-white" : "hover:bg-mint/50"}`} onClick={() => setMode(item)}>
              {item.toLowerCase().replace("_", " ")}
            </button>
          ))}
        </div>
        <form className="grid gap-3 p-4 md:grid-cols-2" onSubmit={create}>
          {mode === "MINISTRY" ? (
            <>
              <Input name="name" placeholder="Ministry name" required />
              <Input name="description" placeholder="Description" />
              <select name="leaderId" className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">Choose leader</option>
                {data.users.map((user) => <option key={user.id} value={user.id}>{user.name ?? user.email}</option>)}
              </select>
            </>
          ) : null}
          {mode === "EVENT" ? (
            <>
              <Input name="title" placeholder="Event or service title" required />
              <select name="eventType" className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm"><option>SERVICE</option><option>EVENT</option><option>OUTREACH</option><option>MEETING</option><option>TRAINING</option></select>
              <Input name="startsAt" type="datetime-local" required />
              <Input name="endsAt" type="datetime-local" required />
              <Input name="location" placeholder="Location" />
              <select name="ministryId" className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm"><option value="">No ministry</option>{data.ministries.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            </>
          ) : null}
          {mode === "FOLLOW_UP" ? (
            <>
              <Input name="personName" placeholder="Person's name" required />
              <Input name="reason" placeholder="Reason for follow-up" required />
              <Input name="email" type="email" placeholder="Email" />
              <Input name="phone" placeholder="Phone" />
              <Input name="nextContactAt" type="datetime-local" />
              <select name="assignedToId" className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm"><option value="">Unassigned</option>{data.users.map((user) => <option key={user.id} value={user.id}>{user.name ?? user.email}</option>)}</select>
            </>
          ) : null}
          {mode === "RESOURCE" ? (
            <>
              <Input name="name" placeholder="Resource name" required />
              <Input name="category" placeholder="Room, vehicle, equipment..." required />
              <Input name="location" placeholder="Location" />
              <Input name="description" placeholder="Description" />
            </>
          ) : null}
          {mode === "BOOKING" ? (
            <>
              <select name="resourceId" required className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm"><option value="">Choose resource</option>{data.resources.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <Input name="title" placeholder="Booking purpose" required />
              <Input name="startsAt" type="datetime-local" required />
              <Input name="endsAt" type="datetime-local" required />
            </>
          ) : null}
          {error ? <p className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay md:col-span-2">{error}</p> : null}
          <Button className="md:col-span-2" type="submit"><Plus className="h-4 w-4" />Create {mode.toLowerCase().replace("_", " ")}</Button>
        </form>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-ink/10 bg-white">
          <h2 className="border-b border-ink/10 px-4 py-3 font-semibold">Upcoming services and events</h2>
          <div className="divide-y divide-ink/10">
            {loading ? <p className="flex items-center gap-2 p-4 text-sm text-ink/55"><Loader2 className="h-4 w-4 animate-spin" />Loading</p> : null}
            {data.events.slice(0, 12).map((item) => <div key={item.id} className="px-4 py-3"><p className="text-sm font-medium">{item.title}</p><p className="text-xs text-ink/50">{item.eventType.toLowerCase()} · {new Date(item.startsAt).toLocaleString()} · {item.location ?? "Location pending"}</p></div>)}
          </div>
        </div>
        <div className="rounded-lg border border-ink/10 bg-white">
          <h2 className="border-b border-ink/10 px-4 py-3 font-semibold">Pastoral follow-up</h2>
          <div className="divide-y divide-ink/10">
            {data.followUps.slice(0, 12).map((item) => <div key={item.id} className="px-4 py-3"><p className="text-sm font-medium">{item.personName}</p><p className="text-xs text-ink/50">{item.reason} · {item.status.toLowerCase().replace("_", " ")}</p></div>)}
          </div>
        </div>
      </section>
    </div>
  );
}
