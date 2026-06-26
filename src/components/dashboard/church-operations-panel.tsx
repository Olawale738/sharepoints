"use client";

import {
  AlertTriangle,
  ArrowRightLeft,
  CalendarDays,
  ClipboardList,
  FileWarning,
  HeartHandshake,
  Loader2,
  Plus,
  QrCode,
  ShieldAlert,
  Trash2,
  UsersRound,
  Wrench,
  X
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Operations = {
  ministries: Array<{ id: string; name: string; description?: string | null }>;
  events: Array<{ id: string; title: string; eventType: string; startsAt: string; location?: string | null }>;
  attendance: Array<{ id: string; eventId: string; displayName: string; checkedInAt: string }>;
  volunteers: Array<{ id: string; eventId: string; userId: string; role: string; status: string }>;
  followUps: Array<{ id: string; personName: string; reason: string; status: string; nextContactAt?: string | null }>;
  resources: Array<{ id: string; name: string; category: string; location?: string | null }>;
  bookings: Array<{ id: string; resourceId: string; title: string; status: string; startsAt: string; endsAt: string }>;
  users: Array<{ id: string; name?: string | null; email?: string | null }>;
  workspaces: Array<{ id: string; name: string }>;
  units: Array<{ id: string; name: string; type: string; parentId?: string | null }>;
  projects: Array<{ id: string; name: string; projectType: string; status: string; budgetAmount?: number | null; budgetCurrency: string; dueAt?: string | null }>;
  projectTasks: Array<{ id: string; projectId: string; title: string; status: string; priority: string; dueDate?: string | null }>;
  projectBudgets: Array<{ id: string; projectId: string; title: string; amount: number; currency: string; status: string }>;
  counsellingCases: Array<{ id: string; subjectName: string; category: string; status: string; sensitivity: string; assignedToId?: string | null; createdAt: string }>;
  counsellingNotes: Array<{ id: string; caseId: string; body: string; createdAt: string }>;
  attendanceSessions: Array<{ id: string; title: string; targetType: string; qrToken: string; active: boolean; startsAt?: string | null }>;
  smartAttendanceRecords: Array<{ id: string; sessionId: string; displayName: string; checkedInAt: string }>;
  expiryItems: Array<{ id: string; title: string; targetType: string; status: string; reviewDueAt?: string | null; expiresAt?: string | null }>;
  branchTransfers: Array<{ id: string; userId: string; fromUnitId?: string | null; toUnitId: string; status: string; reason?: string | null; createdAt: string }>;
};

type CreateMode =
  | "MINISTRY"
  | "EVENT"
  | "FOLLOW_UP"
  | "RESOURCE"
  | "BOOKING"
  | "PROJECT"
  | "PROJECT_TASK"
  | "PROJECT_BUDGET"
  | "COUNSELLING_CASE"
  | "COUNSELLING_NOTE"
  | "ATTENDANCE_SESSION"
  | "ATTENDANCE_CHECK_IN"
  | "EXPIRY_ITEM"
  | "BRANCH_TRANSFER";
type DeleteTarget = {
  entity: CreateMode;
  id: string;
  label: string;
  warning: string;
};

const emptyOperations: Operations = {
  ministries: [],
  events: [],
  attendance: [],
  volunteers: [],
  followUps: [],
  resources: [],
  bookings: [],
  users: [],
  workspaces: [],
  units: [],
  projects: [],
  projectTasks: [],
  projectBudgets: [],
  counsellingCases: [],
  counsellingNotes: [],
  attendanceSessions: [],
  smartAttendanceRecords: [],
  expiryItems: [],
  branchTransfers: []
};

function displayEntity(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

function DeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      aria-label={`Delete ${label}`}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-clay transition hover:bg-clay/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay"
      title={`Delete ${label}`}
      type="button"
      onClick={onClick}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}

export function ChurchOperationsPanel() {
  const [data, setData] = useState<Operations>(emptyOperations);
  const [mode, setMode] = useState<CreateMode>("MINISTRY");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleting, setDeleting] = useState(false);

  const metrics = [
    { label: "Ministries", value: data.ministries.length, icon: HeartHandshake },
    { label: "Events", value: data.events.length, icon: CalendarDays },
    { label: "Attendance", value: data.attendance.length, icon: UsersRound },
    {
      label: "Follow-ups",
      value: data.followUps.filter((item) => item.status !== "CLOSED").length,
      icon: HeartHandshake
    },
    { label: "Resources", value: data.resources.length, icon: Wrench },
    { label: "Projects", value: data.projects.length, icon: ClipboardList },
    { label: "Counselling", value: data.counsellingCases.filter((item) => item.status !== "CLOSED").length, icon: ShieldAlert },
    { label: "QR sessions", value: data.attendanceSessions.filter((item) => item.active).length, icon: QrCode },
    { label: "Expiry alerts", value: data.expiryItems.filter((item) => item.status !== "ARCHIVED").length, icon: FileWarning }
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

  useEffect(() => {
    void load();
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const payload: Record<string, unknown> = { entity: mode, ...values };
    for (const optionalKey of [
      "leaderId",
      "ministryId",
      "assignedToId",
      "eventId",
      "email",
      "phone",
      "workspaceId",
      "organizationUnitId",
      "ownerId",
      "subjectUserId",
      "fromUnitId",
      "targetId",
      "userId"
    ]) {
      if (payload[optionalKey] === "") payload[optionalKey] = null;
    }
    if (mode === "EVENT" || mode === "BOOKING") {
      payload.startsAt = new Date(String(values.startsAt)).toISOString();
      payload.endsAt = new Date(String(values.endsAt)).toISOString();
    }
    if (mode === "PROJECT") {
      payload.startsAt = values.startsAt ? new Date(String(values.startsAt)).toISOString() : null;
      payload.dueAt = values.dueAt ? new Date(String(values.dueAt)).toISOString() : null;
      payload.budgetAmount = values.budgetAmount ? Number(values.budgetAmount) : null;
    }
    if (mode === "PROJECT_TASK") {
      payload.dueDate = values.dueDate ? new Date(String(values.dueDate)).toISOString() : null;
    }
    if (mode === "PROJECT_BUDGET") {
      payload.amount = Number(values.amount);
    }
    if (mode === "COUNSELLING_NOTE") {
      payload.nextContactAt = values.nextContactAt ? new Date(String(values.nextContactAt)).toISOString() : null;
    }
    if (mode === "ATTENDANCE_SESSION") {
      payload.startsAt = values.startsAt ? new Date(String(values.startsAt)).toISOString() : null;
      payload.endsAt = values.endsAt ? new Date(String(values.endsAt)).toISOString() : null;
    }
    if (mode === "EXPIRY_ITEM") {
      payload.reviewDueAt = values.reviewDueAt ? new Date(String(values.reviewDueAt)).toISOString() : null;
      payload.expiresAt = values.expiresAt ? new Date(String(values.expiresAt)).toISOString() : null;
    }
    if (mode === "FOLLOW_UP") {
      payload.nextContactAt = values.nextContactAt ? new Date(String(values.nextContactAt)).toISOString() : null;
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
    setMessage(`${displayEntity(mode)} created.`);
    await load();
  }

  async function deleteRecord() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/church/operations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity: deleteTarget.entity, id: deleteTarget.id })
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setDeleting(false);
    if (!response.ok) {
      setError(body?.error ?? `${deleteTarget.label} could not be deleted.`);
      return;
    }
    setMessage(`${deleteTarget.label} deleted.`);
    setDeleteTarget(null);
    await load();
  }

  function resourceName(resourceId: string) {
    return data.resources.find((resource) => resource.id === resourceId)?.name ?? "Deleted resource";
  }

  function userName(userId?: string | null) {
    const user = data.users.find((item) => item.id === userId);
    return user?.name ?? user?.email ?? "Unassigned";
  }

  function unitName(unitId?: string | null) {
    return data.units.find((item) => item.id === unitId)?.name ?? "No branch";
  }

  async function updateRecord(entity: string, id: string, status?: string, active?: boolean) {
    setError("");
    const response = await fetch("/api/church/operations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity, id, status, active })
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setError(body?.error ?? "Record could not be updated.");
      return;
    }
    setMessage("Record updated.");
    await load();
  }

  return (
    <div className="space-y-6">
      {message ? <p className="rounded-md border border-moss/15 bg-mint px-4 py-3 text-sm text-moss">{message}</p> : null}
      {error ? <p className="rounded-md bg-clay/10 px-4 py-3 text-sm text-clay">{error}</p> : null}

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
          {([
            "MINISTRY",
            "EVENT",
            "FOLLOW_UP",
            "RESOURCE",
            "BOOKING",
            "PROJECT",
            "PROJECT_TASK",
            "PROJECT_BUDGET",
            "COUNSELLING_CASE",
            "COUNSELLING_NOTE",
            "ATTENDANCE_SESSION",
            "ATTENDANCE_CHECK_IN",
            "EXPIRY_ITEM",
            "BRANCH_TRANSFER"
          ] as const).map((item) => (
            <button
              key={item}
              className={`rounded-md px-3 py-2 text-sm font-medium ${mode === item ? "bg-moss text-white" : "hover:bg-mint/50"}`}
              type="button"
              onClick={() => setMode(item)}
            >
              {displayEntity(item)}
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
              <select name="eventType" className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option>SERVICE</option>
                <option>EVENT</option>
                <option>OUTREACH</option>
                <option>MEETING</option>
                <option>TRAINING</option>
              </select>
              <Input name="startsAt" type="datetime-local" required />
              <Input name="endsAt" type="datetime-local" required />
              <Input name="location" placeholder="Location" />
              <select name="ministryId" className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">No ministry</option>
                {data.ministries.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </>
          ) : null}
          {mode === "FOLLOW_UP" ? (
            <>
              <Input name="personName" placeholder="Person's name" required />
              <Input name="reason" placeholder="Reason for follow-up" required />
              <Input name="email" type="email" placeholder="Email" />
              <Input name="phone" placeholder="Phone" />
              <Input name="nextContactAt" type="datetime-local" />
              <select name="assignedToId" className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">Unassigned</option>
                {data.users.map((user) => <option key={user.id} value={user.id}>{user.name ?? user.email}</option>)}
              </select>
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
              <select name="resourceId" required className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">Choose resource</option>
                {data.resources.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <Input name="title" placeholder="Booking purpose" required />
              <Input name="startsAt" type="datetime-local" required />
              <Input name="endsAt" type="datetime-local" required />
            </>
          ) : null}
          {mode === "PROJECT" ? (
            <>
              <Input name="name" placeholder="Project name" required />
              <select name="projectType" className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                {["BUILDING", "MISSION", "OUTREACH", "CRUSADE", "ADMINISTRATIVE", "OTHER"].map((item) => <option key={item}>{item}</option>)}
              </select>
              <select name="organizationUnitId" className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">No branch scope</option>
                {data.units.map((item) => <option key={item.id} value={item.id}>{item.type.toLowerCase()}: {item.name}</option>)}
              </select>
              <select name="ministryId" className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">No ministry</option>
                {data.ministries.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <select name="ownerId" className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">No owner</option>
                {data.users.map((user) => <option key={user.id} value={user.id}>{user.name ?? user.email}</option>)}
              </select>
              <Input name="budgetAmount" type="number" min="0" placeholder="Budget amount in minor units" />
              <Input name="budgetCurrency" defaultValue="GBP" placeholder="Currency" maxLength={3} />
              <Input name="startsAt" type="datetime-local" />
              <Input name="dueAt" type="datetime-local" />
              <Textarea className="md:col-span-2" name="description" placeholder="Project description, scope, and success outcome" />
            </>
          ) : null}
          {mode === "PROJECT_TASK" ? (
            <>
              <select name="projectId" required className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">Choose project</option>
                {data.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <Input name="title" placeholder="Task title" required />
              <select name="assignedToId" className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">Unassigned</option>
                {data.users.map((user) => <option key={user.id} value={user.id}>{user.name ?? user.email}</option>)}
              </select>
              <select name="priority" className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                {["LOW", "NORMAL", "HIGH", "URGENT"].map((item) => <option key={item}>{item}</option>)}
              </select>
              <Input name="dueDate" type="datetime-local" />
              <Input name="description" placeholder="Short task description" />
            </>
          ) : null}
          {mode === "PROJECT_BUDGET" ? (
            <>
              <select name="projectId" required className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">Choose project</option>
                {data.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <Input name="title" placeholder="Budget item" required />
              <Input name="category" placeholder="Materials, transport, media..." />
              <Input name="amount" type="number" min="1" placeholder="Amount in minor units" required />
              <Input name="currency" defaultValue="GBP" placeholder="Currency" maxLength={3} />
              <Input name="notes" placeholder="Notes" />
            </>
          ) : null}
          {mode === "COUNSELLING_CASE" ? (
            <>
              <Input name="subjectName" placeholder="Person or confidential reference" required />
              <Input name="category" placeholder="Marriage, prayer, welfare, safeguarding..." required />
              <select name="subjectUserId" className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">No linked member</option>
                {data.users.map((user) => <option key={user.id} value={user.id}>{user.name ?? user.email}</option>)}
              </select>
              <select name="assignedToId" className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">Unassigned</option>
                {data.users.map((user) => <option key={user.id} value={user.id}>{user.name ?? user.email}</option>)}
              </select>
              <select name="organizationUnitId" className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">No branch scope</option>
                {data.units.map((item) => <option key={item.id} value={item.id}>{item.type.toLowerCase()}: {item.name}</option>)}
              </select>
              <select name="sensitivity" className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option>PASTORAL</option>
                <option>SAFEGUARDING</option>
                <option>HIGHLY_RESTRICTED</option>
              </select>
              <Textarea className="md:col-span-2" name="summary" placeholder="Restricted counselling summary. Excluded from AI search." required />
            </>
          ) : null}
          {mode === "COUNSELLING_NOTE" ? (
            <>
              <select name="caseId" required className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">Choose counselling case</option>
                {data.counsellingCases.map((item) => <option key={item.id} value={item.id}>{item.subjectName} - {item.status}</option>)}
              </select>
              <Input name="nextContactAt" type="datetime-local" />
              <Textarea className="md:col-span-2" name="body" placeholder="Private counselling note" required />
            </>
          ) : null}
          {mode === "ATTENDANCE_SESSION" ? (
            <>
              <Input name="title" placeholder="Service, meeting, or event title" required />
              <select name="targetType" className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option>SERVICE</option>
                <option>MEETING</option>
                <option>EVENT</option>
              </select>
              <select name="organizationUnitId" className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">No branch scope</option>
                {data.units.map((item) => <option key={item.id} value={item.id}>{item.type.toLowerCase()}: {item.name}</option>)}
              </select>
              <Input name="targetId" placeholder="Optional service/meeting/event reference" />
              <Input name="startsAt" type="datetime-local" />
              <Input name="endsAt" type="datetime-local" />
            </>
          ) : null}
          {mode === "ATTENDANCE_CHECK_IN" ? (
            <>
              <select name="sessionId" required className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">Choose attendance session</option>
                {data.attendanceSessions.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
              <select name="userId" className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">Current admin account</option>
                {data.users.map((user) => <option key={user.id} value={user.id}>{user.name ?? user.email}</option>)}
              </select>
              <Input name="displayName" placeholder="Display name" required />
              <Input name="email" type="email" placeholder="Email" />
              <Input className="md:col-span-2" name="notes" placeholder="Check-in note" />
            </>
          ) : null}
          {mode === "EXPIRY_ITEM" ? (
            <>
              <Input name="title" placeholder="Document, policy, permit, or certificate title" required />
              <select name="targetType" className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                {["FILE", "POLICY", "CERTIFICATE", "FORM", "PERMIT", "OTHER"].map((item) => <option key={item}>{item}</option>)}
              </select>
              <Input name="targetId" placeholder="Optional file/policy/form ID" />
              <select name="ownerId" className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">No owner</option>
                {data.users.map((user) => <option key={user.id} value={user.id}>{user.name ?? user.email}</option>)}
              </select>
              <Input name="reviewDueAt" type="datetime-local" />
              <Input name="expiresAt" type="datetime-local" />
              <Input className="md:col-span-2" name="notes" placeholder="Review notes" />
            </>
          ) : null}
          {mode === "BRANCH_TRANSFER" ? (
            <>
              <select name="userId" required className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">Choose member</option>
                {data.users.map((user) => <option key={user.id} value={user.id}>{user.name ?? user.email}</option>)}
              </select>
              <select name="fromUnitId" className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">Current branch unknown</option>
                {data.units.map((item) => <option key={item.id} value={item.id}>{item.type.toLowerCase()}: {item.name}</option>)}
              </select>
              <select name="toUnitId" required className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">New branch/church/ministry</option>
                {data.units.map((item) => <option key={item.id} value={item.id}>{item.type.toLowerCase()}: {item.name}</option>)}
              </select>
              <Input name="reason" placeholder="Reason for transfer" />
            </>
          ) : null}
          <Button className="md:col-span-2" type="submit">
            <Plus className="h-4 w-4" />
            Create {displayEntity(mode)}
          </Button>
        </form>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-ink/10 bg-white">
          <h2 className="border-b border-ink/10 px-4 py-3 font-semibold">Ministries</h2>
          <div className="max-h-96 divide-y divide-ink/10 overflow-y-auto">
            {loading ? <p className="flex items-center gap-2 p-4 text-sm text-ink/55"><Loader2 className="h-4 w-4 animate-spin" />Loading</p> : null}
            {!loading && data.ministries.length === 0 ? <p className="p-4 text-sm text-ink/55">No ministries created.</p> : null}
            {data.ministries.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-ink/50">{item.description || "No description"}</p>
                </div>
                <DeleteButton
                  label={item.name}
                  onClick={() => setDeleteTarget({
                    entity: "MINISTRY",
                    id: item.id,
                    label: item.name,
                    warning: "Connected events and volunteer assignments will be kept but detached from this ministry."
                  })}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-ink/10 bg-white">
          <h2 className="border-b border-ink/10 px-4 py-3 font-semibold">Services and events</h2>
          <div className="max-h-96 divide-y divide-ink/10 overflow-y-auto">
            {!loading && data.events.length === 0 ? <p className="p-4 text-sm text-ink/55">No events created.</p> : null}
            {data.events.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-ink/50">
                    {displayEntity(item.eventType)} · {new Date(item.startsAt).toLocaleString()} · {item.location ?? "Location pending"}
                  </p>
                </div>
                <DeleteButton
                  label={item.title}
                  onClick={() => setDeleteTarget({
                    entity: "EVENT",
                    id: item.id,
                    label: item.title,
                    warning: "Attendance and volunteer assignments will be deleted. Resource bookings will be preserved and detached."
                  })}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-ink/10 bg-white">
          <h2 className="border-b border-ink/10 px-4 py-3 font-semibold">Pastoral follow-up</h2>
          <div className="max-h-96 divide-y divide-ink/10 overflow-y-auto">
            {!loading && data.followUps.length === 0 ? <p className="p-4 text-sm text-ink/55">No follow-ups created.</p> : null}
            {data.followUps.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.personName}</p>
                  <p className="text-xs text-ink/50">{item.reason} · {displayEntity(item.status)}</p>
                </div>
                <DeleteButton
                  label={`${item.personName} follow-up`}
                  onClick={() => setDeleteTarget({
                    entity: "FOLLOW_UP",
                    id: item.id,
                    label: `${item.personName} follow-up`,
                    warning: "This pastoral follow-up record will be permanently removed."
                  })}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-ink/10 bg-white">
          <h2 className="border-b border-ink/10 px-4 py-3 font-semibold">Resources</h2>
          <div className="max-h-96 divide-y divide-ink/10 overflow-y-auto">
            {!loading && data.resources.length === 0 ? <p className="p-4 text-sm text-ink/55">No resources created.</p> : null}
            {data.resources.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-ink/50">{item.category} · {item.location ?? "Location not set"}</p>
                </div>
                <DeleteButton
                  label={item.name}
                  onClick={() => setDeleteTarget({
                    entity: "RESOURCE",
                    id: item.id,
                    label: item.name,
                    warning: "All bookings connected to this resource will also be permanently deleted."
                  })}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-ink/10 bg-white lg:col-span-2">
          <h2 className="border-b border-ink/10 px-4 py-3 font-semibold">Resource bookings</h2>
          <div className="max-h-96 divide-y divide-ink/10 overflow-y-auto">
            {!loading && data.bookings.length === 0 ? <p className="p-4 text-sm text-ink/55">No bookings created.</p> : null}
            {data.bookings.map((item) => (
              <div key={item.id} className="flex items-start justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-ink/50">
                    {resourceName(item.resourceId)} · {new Date(item.startsAt).toLocaleString()} · {displayEntity(item.status)}
                  </p>
                </div>
                <DeleteButton
                  label={item.title}
                  onClick={() => setDeleteTarget({
                    entity: "BOOKING",
                    id: item.id,
                    label: item.title,
                    warning: "This resource booking will be permanently removed."
                  })}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-ink/10 bg-white">
          <h2 className="border-b border-ink/10 px-4 py-3 font-semibold">Projects, missions, outreach and crusades</h2>
          <div className="max-h-96 divide-y divide-ink/10 overflow-y-auto">
            {data.projects.length === 0 ? <p className="p-4 text-sm text-ink/55">No projects created.</p> : null}
            {data.projects.map((item) => (
              <div className="flex items-start justify-between gap-3 px-4 py-3" key={item.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.name}</p>
                  <p className="text-xs text-ink/50">
                    {displayEntity(item.projectType)} - {displayEntity(item.status)} - budget {item.budgetAmount ?? 0} {item.budgetCurrency}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "CANCELLED"].map((status) => (
                      <button className="rounded-md border border-ink/10 px-2 py-1 text-xs hover:bg-mint/50" key={status} type="button" onClick={() => void updateRecord("PROJECT", item.id, status)}>
                        {displayEntity(status)}
                      </button>
                    ))}
                  </div>
                </div>
                <DeleteButton
                  label={item.name}
                  onClick={() => setDeleteTarget({
                    entity: "PROJECT",
                    id: item.id,
                    label: item.name,
                    warning: "Project tasks, budget lines, and linked project documents will be removed."
                  })}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-ink/10 bg-white">
          <h2 className="border-b border-ink/10 px-4 py-3 font-semibold">Project tasks and budgets</h2>
          <div className="max-h-96 divide-y divide-ink/10 overflow-y-auto">
            {[...data.projectTasks, ...data.projectBudgets].length === 0 ? <p className="p-4 text-sm text-ink/55">No project task or budget records.</p> : null}
            {data.projectTasks.map((item) => (
              <div className="px-4 py-3" key={item.id}>
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-ink/50">Task - {displayEntity(item.status)} - {displayEntity(item.priority)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {["TODO", "IN_PROGRESS", "BLOCKED", "DONE"].map((status) => (
                    <button className="rounded-md border border-ink/10 px-2 py-1 text-xs hover:bg-mint/50" key={status} type="button" onClick={() => void updateRecord("PROJECT_TASK", item.id, status)}>
                      {displayEntity(status)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {data.projectBudgets.map((item) => (
              <div className="px-4 py-3" key={item.id}>
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-ink/50">Budget - {item.amount} {item.currency} - {displayEntity(item.status)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {["REQUESTED", "APPROVED", "PAID", "REJECTED"].map((status) => (
                    <button className="rounded-md border border-ink/10 px-2 py-1 text-xs hover:bg-mint/50" key={status} type="button" onClick={() => void updateRecord("PROJECT_BUDGET", item.id, status)}>
                      {displayEntity(status)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-ink/10 bg-white">
          <h2 className="border-b border-ink/10 px-4 py-3 font-semibold">Restricted counselling cases</h2>
          <div className="max-h-96 divide-y divide-ink/10 overflow-y-auto">
            {data.counsellingCases.length === 0 ? <p className="p-4 text-sm text-ink/55">No restricted counselling cases.</p> : null}
            {data.counsellingCases.map((item) => (
              <div className="flex items-start justify-between gap-3 px-4 py-3" key={item.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.subjectName}</p>
                  <p className="text-xs text-ink/50">{item.category} - {displayEntity(item.sensitivity)} - assigned to {userName(item.assignedToId)}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {["OPEN", "ACTIVE", "FOLLOW_UP", "CLOSED"].map((status) => (
                      <button className="rounded-md border border-ink/10 px-2 py-1 text-xs hover:bg-mint/50" key={status} type="button" onClick={() => void updateRecord("COUNSELLING_CASE", item.id, status)}>
                        {displayEntity(status)}
                      </button>
                    ))}
                  </div>
                </div>
                <DeleteButton
                  label={`${item.subjectName} counselling case`}
                  onClick={() => setDeleteTarget({
                    entity: "COUNSELLING_CASE",
                    id: item.id,
                    label: `${item.subjectName} counselling case`,
                    warning: "This will permanently remove the counselling case and private notes."
                  })}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-ink/10 bg-white">
          <h2 className="border-b border-ink/10 px-4 py-3 font-semibold">Smart QR attendance</h2>
          <div className="max-h-96 divide-y divide-ink/10 overflow-y-auto">
            {data.attendanceSessions.length === 0 ? <p className="p-4 text-sm text-ink/55">No QR attendance sessions.</p> : null}
            {data.attendanceSessions.map((item) => {
              const count = data.smartAttendanceRecords.filter((record) => record.sessionId === item.id).length;
              return (
                <div className="flex items-start justify-between gap-3 px-4 py-3" key={item.id}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-ink/50">{displayEntity(item.targetType)} - {item.active ? "active" : "closed"} - {count} checked in</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a className="rounded-md border border-ink/10 px-2 py-1 text-xs hover:bg-mint/50" href={`/api/smart-attendance/${item.id}/qr`} target="_blank">Open QR</a>
                      <button className="rounded-md border border-ink/10 px-2 py-1 text-xs hover:bg-mint/50" type="button" onClick={() => void updateRecord("ATTENDANCE_SESSION", item.id, undefined, !item.active)}>
                        {item.active ? "Close" : "Reopen"}
                      </button>
                    </div>
                  </div>
                  <DeleteButton
                    label={item.title}
                    onClick={() => setDeleteTarget({
                      entity: "ATTENDANCE_SESSION",
                      id: item.id,
                      label: item.title,
                      warning: "This QR attendance session and check-in records will be deleted."
                    })}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-lg border border-ink/10 bg-white">
          <h2 className="border-b border-ink/10 px-4 py-3 font-semibold">Document expiry alerts</h2>
          <div className="max-h-96 divide-y divide-ink/10 overflow-y-auto">
            {data.expiryItems.length === 0 ? <p className="p-4 text-sm text-ink/55">No expiry or review alerts.</p> : null}
            {data.expiryItems.map((item) => (
              <div className="flex items-start justify-between gap-3 px-4 py-3" key={item.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="text-xs text-ink/50">
                    {displayEntity(item.targetType)} - {displayEntity(item.status)} - review {item.reviewDueAt ? new Date(item.reviewDueAt).toLocaleDateString() : "not set"} - expires {item.expiresAt ? new Date(item.expiresAt).toLocaleDateString() : "not set"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {["ACTIVE", "REVIEW_DUE", "EXPIRED", "RENEWED", "ARCHIVED"].map((status) => (
                      <button className="rounded-md border border-ink/10 px-2 py-1 text-xs hover:bg-mint/50" key={status} type="button" onClick={() => void updateRecord("EXPIRY_ITEM", item.id, status)}>
                        {displayEntity(status)}
                      </button>
                    ))}
                  </div>
                </div>
                <DeleteButton
                  label={item.title}
                  onClick={() => setDeleteTarget({
                    entity: "EXPIRY_ITEM",
                    id: item.id,
                    label: item.title,
                    warning: "This expiry alert will be deleted."
                  })}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-ink/10 bg-white">
          <h2 className="border-b border-ink/10 px-4 py-3 font-semibold">Branch transfer history</h2>
          <div className="max-h-96 divide-y divide-ink/10 overflow-y-auto">
            {data.branchTransfers.length === 0 ? <p className="p-4 text-sm text-ink/55">No branch transfers.</p> : null}
            {data.branchTransfers.map((item) => (
              <div className="flex items-start justify-between gap-3 px-4 py-3" key={item.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{userName(item.userId)}</p>
                  <p className="text-xs text-ink/50">{unitName(item.fromUnitId)} to {unitName(item.toUnitId)} - {displayEntity(item.status)}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {["APPROVED", "REJECTED", "CANCELLED"].map((status) => (
                      <button className="rounded-md border border-ink/10 px-2 py-1 text-xs hover:bg-mint/50" key={status} type="button" onClick={() => void updateRecord("BRANCH_TRANSFER", item.id, status)}>
                        {displayEntity(status)}
                      </button>
                    ))}
                  </div>
                </div>
                <DeleteButton
                  label="branch transfer"
                  onClick={() => setDeleteTarget({
                    entity: "BRANCH_TRANSFER",
                    id: item.id,
                    label: "branch transfer",
                    warning: "This branch transfer request will be deleted from the history."
                  })}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4" role="presentation">
          <section
            aria-labelledby="delete-operation-title"
            aria-modal="true"
            className="w-full max-w-md rounded-lg border border-ink/10 bg-white p-5 shadow-xl"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-clay/10 text-clay">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <div>
                  <h2 id="delete-operation-title" className="font-semibold">Delete {deleteTarget.label}?</h2>
                  <p className="mt-1 text-sm text-ink/60">{deleteTarget.warning}</p>
                </div>
              </div>
              <button
                aria-label="Close deletion confirmation"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-ink/5"
                disabled={deleting}
                type="button"
                onClick={() => setDeleteTarget(null)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-4 rounded-md bg-paper p-3 text-xs text-ink/55">
              This administrative action is recorded in the LETW activity audit.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button disabled={deleting} variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button disabled={deleting} variant="danger" onClick={() => void deleteRecord()}>
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete permanently
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
