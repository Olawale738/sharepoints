"use client";

import {
  Award,
  BookOpenCheck,
  Hammer,
  HeartHandshake,
  Loader2,
  Megaphone,
  Plus,
  Radio,
  Trash2,
  X
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type UserOption = { id: string; name?: string | null; email?: string | null };
type WorkspaceOption = { id: string; name: string };
type UnitOption = { id: string; name: string; type: string };
type MinistryOption = { id: string; name: string };
type ResourceOption = { id: string; name: string; category: string };

type GrowthData = {
  isAdmin: boolean;
  programs: Array<{ id: string; title: string; category: string; level: string; status: string; durationMinutes?: number | null }>;
  enrollments: Array<{ id: string; programId: string; userId: string; status: string; progress: number; dueAt?: string | null; certificateNumber?: string | null }>;
  prayerRequests: Array<{ id: string; title: string; priority: string; status: string; visibility: string; createdById: string; assignedToId?: string | null; createdAt: string }>;
  prayerNotes: Array<{ id: string; prayerRequestId: string; authorId: string; body: string; createdAt: string }>;
  maintenanceTickets: Array<{ id: string; title: string; category: string; priority: string; status: string; assignedToId?: string | null; dueAt?: string | null; createdAt: string }>;
  campaigns: Array<{ id: string; title: string; campaignType: string; status: string; goalCount?: number | null; currentCount: number; ownerId?: string | null; startsAt?: string | null }>;
  campaignUpdates: Array<{ id: string; campaignId: string; body: string; progressCount?: number | null; createdAt: string }>;
  sermonResources: Array<{ id: string; title: string; speaker: string; scripture?: string | null; language: string; mediaUrl?: string | null; visibility: string; createdAt: string }>;
  users: UserOption[];
  workspaces: WorkspaceOption[];
  units: UnitOption[];
  ministries: MinistryOption[];
  resources: ResourceOption[];
};

type Mode =
  | "TRAINING_PROGRAM"
  | "TRAINING_ENROLLMENT"
  | "PRAYER_REQUEST"
  | "PRAYER_NOTE"
  | "ASSET_MAINTENANCE"
  | "MINISTRY_CAMPAIGN"
  | "CAMPAIGN_UPDATE"
  | "SERMON_RESOURCE";

type DeleteTarget = { entity: Exclude<Mode, "PRAYER_NOTE" | "CAMPAIGN_UPDATE"> | "TRAINING_ENROLLMENT"; id: string; label: string };

const emptyData: GrowthData = {
  isAdmin: false,
  programs: [],
  enrollments: [],
  prayerRequests: [],
  prayerNotes: [],
  maintenanceTickets: [],
  campaigns: [],
  campaignUpdates: [],
  sermonResources: [],
  users: [],
  workspaces: [],
  units: [],
  ministries: [],
  resources: []
};

function titleCase(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isoFromInput(value: FormDataEntryValue | undefined) {
  return value ? new Date(String(value)).toISOString() : null;
}

export function GrowthSuitePanel() {
  const [data, setData] = useState<GrowthData>(emptyData);
  const [mode, setMode] = useState<Mode>("PRAYER_REQUEST");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [clearingLogs, setClearingLogs] = useState(false);

  const usersById = useMemo(() => new Map(data.users.map((user) => [user.id, user.name ?? user.email ?? "Member"])), [data.users]);
  const programsById = useMemo(() => new Map(data.programs.map((program) => [program.id, program.title])), [data.programs]);
  const modeOptions: Array<[Mode, string]> = data.isAdmin
    ? [
        ["TRAINING_PROGRAM", "Training program"],
        ["TRAINING_ENROLLMENT", "Assign training"],
        ["PRAYER_REQUEST", "Prayer request"],
        ["PRAYER_NOTE", "Prayer note"],
        ["ASSET_MAINTENANCE", "Maintenance"],
        ["MINISTRY_CAMPAIGN", "Campaign"],
        ["CAMPAIGN_UPDATE", "Campaign update"],
        ["SERMON_RESOURCE", "Sermon resource"]
      ]
    : [
        ["PRAYER_REQUEST", "Prayer request"],
        ["PRAYER_NOTE", "Prayer note"],
        ["ASSET_MAINTENANCE", "Maintenance report"]
      ];

  async function load() {
    setLoading(true);
    const response = await fetch("/api/church/growth");
    const body = (await response.json().catch(() => null)) as (GrowthData & { error?: string }) | null;
    setLoading(false);
    if (!response.ok || !body) {
      setError(body?.error ?? "Growth suite could not be loaded.");
      return;
    }
    setData(body);
    if (!body.isAdmin && !["PRAYER_REQUEST", "PRAYER_NOTE", "ASSET_MAINTENANCE"].includes(mode)) {
      setMode("PRAYER_REQUEST");
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const payload: Record<string, unknown> = { entity: mode, ...values };
    for (const key of ["workspaceId", "organizationUnitId", "userId", "assignedToId", "resourceId", "ministryId", "ownerId", "programId", "prayerRequestId", "campaignId"]) {
      if (payload[key] === "") payload[key] = null;
    }
    for (const key of ["dueAt", "startsAt", "endsAt"]) {
      payload[key] = isoFromInput(values[key]);
    }
    setBusy(mode);
    setError("");
    setNotice("");
    const response = await fetch("/api/church/growth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(body?.error ?? "The growth record could not be created.");
      return;
    }
    form.reset();
    setNotice(`${titleCase(mode)} saved.`);
    await load();
  }

  async function update(entity: string, id: string, fields: Record<string, unknown>) {
    setError("");
    const response = await fetch("/api/church/growth", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity, id, ...fields })
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setError(body?.error ?? "Record could not be updated.");
      return;
    }
    setNotice("Record updated.");
    await load();
  }

  async function deleteRecord() {
    if (!deleteTarget) return;
    setBusy(`delete-${deleteTarget.id}`);
    const response = await fetch("/api/church/growth", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity: deleteTarget.entity, id: deleteTarget.id })
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(body?.error ?? "Record could not be deleted.");
      return;
    }
    setNotice(`${deleteTarget.label} deleted.`);
    setDeleteTarget(null);
    await load();
  }

  async function clearGrowthLogs() {
    setClearingLogs(true);
    setError("");
    const response = await fetch("/api/church/growth", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity: "CLEAR_GROWTH_LOGS", confirmation: "CLEAR GROWTH LOGS" })
    });
    const body = (await response.json().catch(() => null)) as { count?: number; error?: string } | null;
    setClearingLogs(false);
    if (!response.ok) {
      setError(body?.error ?? "Growth logs could not be cleared.");
      return;
    }
    setNotice(`${body?.count ?? 0} growth activity logs cleared.`);
  }

  const metrics = [
    { label: "Training programs", value: data.programs.length, icon: BookOpenCheck },
    { label: "Certificates", value: data.enrollments.filter((item) => item.certificateNumber).length, icon: Award },
    { label: "Prayer and care", value: data.prayerRequests.filter((item) => item.status !== "CLOSED").length, icon: HeartHandshake },
    { label: "Maintenance", value: data.maintenanceTickets.filter((item) => !["RESOLVED", "CLOSED"].includes(item.status)).length, icon: Hammer },
    { label: "Campaigns", value: data.campaigns.filter((item) => item.status === "ACTIVE").length, icon: Megaphone },
    { label: "Resources", value: data.sermonResources.length, icon: Radio }
  ];

  return (
    <div className="space-y-6">
      {notice ? <p className="rounded-md border border-moss/15 bg-mint px-4 py-3 text-sm text-moss">{notice}</p> : null}
      {error ? <p className="rounded-md bg-clay/10 px-4 py-3 text-sm text-clay">{error}</p> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {metrics.map(({ icon: Icon, label, value }) => (
          <div className="rounded-lg border border-ink/10 bg-white p-4" key={label}>
            <Icon className="h-5 w-5 text-moss" />
            <p className="mt-3 text-2xl font-semibold">{value}</p>
            <p className="text-sm text-ink/55">{label}</p>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-ink/10 bg-white">
        <div className="flex flex-wrap gap-1 border-b border-ink/10 p-2">
          {modeOptions.map(([id, label]) => (
            <button
              className={`rounded-md px-3 py-2 text-sm font-medium ${mode === id ? "bg-moss text-white" : "hover:bg-mint/50"}`}
              key={id}
              type="button"
              onClick={() => setMode(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <form className="grid gap-3 p-4 md:grid-cols-2" onSubmit={create}>
          {mode === "TRAINING_PROGRAM" ? (
            <>
              <Input name="title" placeholder="Program title" required />
              <Input name="category" placeholder="Category, e.g. discipleship" required />
              <Input name="level" placeholder="Level" defaultValue="Foundation" />
              <Input name="requiredRole" placeholder="Required role, optional" />
              <Input name="durationMinutes" type="number" min="1" placeholder="Duration in minutes" />
              <ScopedSelectors data={data} />
              <Textarea className="md:col-span-2" name="description" placeholder="Learning outcomes, modules, and assessment instructions" />
            </>
          ) : null}

          {mode === "TRAINING_ENROLLMENT" ? (
            <>
              <Select name="programId" label="Choose program" options={data.programs.map((item) => [item.id, item.title])} required />
              <Select name="userId" label="Choose member" options={data.users.map((item) => [item.id, item.name ?? item.email ?? "Member"])} required />
              <Input name="dueAt" type="datetime-local" />
            </>
          ) : null}

          {mode === "PRAYER_REQUEST" ? (
            <>
              <Input name="title" placeholder="Prayer or care title" required />
              <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="priority" defaultValue="NORMAL">
                {["LOW", "NORMAL", "HIGH", "URGENT"].map((item) => <option key={item}>{item}</option>)}
              </select>
              <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="visibility" defaultValue="PASTORAL">
                {["PRIVATE", "PASTORAL", "WORKSPACE"].map((item) => <option key={item}>{item}</option>)}
              </select>
              <Select name="workspaceId" label="Optional workspace" options={data.workspaces.map((item) => [item.id, item.name])} />
              {data.isAdmin ? <Select name="assignedToId" label="Assign to" options={data.users.map((item) => [item.id, item.name ?? item.email ?? "Member"])} /> : null}
              <Textarea className="md:col-span-2" name="details" placeholder="Details for prayer, pastoral care, or follow-up" required />
            </>
          ) : null}

          {mode === "PRAYER_NOTE" ? (
            <>
              <Select name="prayerRequestId" label="Choose prayer request" options={data.prayerRequests.map((item) => [item.id, item.title])} required />
              <Textarea className="md:col-span-2" name="body" placeholder="Care note or prayer update" required />
            </>
          ) : null}

          {mode === "ASSET_MAINTENANCE" ? (
            <>
              <Input name="title" placeholder="Maintenance title" required />
              <Input name="category" placeholder="Sound, building, vehicle, media..." required />
              <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="priority" defaultValue="NORMAL">
                {["LOW", "NORMAL", "HIGH", "URGENT"].map((item) => <option key={item}>{item}</option>)}
              </select>
              <Select name="resourceId" label="Linked resource" options={data.resources.map((item) => [item.id, `${item.name} (${item.category})`])} />
              <Input name="dueAt" type="datetime-local" />
              {data.isAdmin ? <Select name="assignedToId" label="Assign to" options={data.users.map((item) => [item.id, item.name ?? item.email ?? "Member"])} /> : null}
              <ScopedSelectors data={data} />
              <Textarea className="md:col-span-2" name="issue" placeholder="Describe the fault, damage, replacement, or maintenance needed" required />
            </>
          ) : null}

          {mode === "MINISTRY_CAMPAIGN" ? (
            <>
              <Input name="title" placeholder="Campaign title" required />
              <Input name="campaignType" placeholder="Evangelism, giving, outreach, prayer..." required />
              <Input name="targetAudience" placeholder="Target audience" />
              <Input name="goalCount" type="number" min="0" placeholder="Goal count" />
              <Input name="budgetAmount" type="number" min="0" placeholder="Budget amount" />
              <Input name="budgetCurrency" maxLength={3} defaultValue="GBP" />
              <Input name="startsAt" type="datetime-local" />
              <Input name="endsAt" type="datetime-local" />
              <Select name="ownerId" label="Campaign owner" options={data.users.map((item) => [item.id, item.name ?? item.email ?? "Member"])} />
              <Select name="ministryId" label="Ministry" options={data.ministries.map((item) => [item.id, item.name])} />
              <ScopedSelectors data={data} />
              <Textarea className="md:col-span-2" name="objective" placeholder="Campaign objective, success measures, and follow-up plan" required />
            </>
          ) : null}

          {mode === "CAMPAIGN_UPDATE" ? (
            <>
              <Select name="campaignId" label="Choose campaign" options={data.campaigns.map((item) => [item.id, item.title])} required />
              <Input name="progressCount" type="number" min="0" placeholder="New progress count" />
              <Textarea className="md:col-span-2" name="body" placeholder="Campaign update, testimony, or next action" required />
            </>
          ) : null}

          {mode === "SERMON_RESOURCE" ? (
            <>
              <Input name="title" placeholder="Sermon or resource title" required />
              <Input name="speaker" placeholder="Speaker" required />
              <Input name="scripture" placeholder="Scripture reference" />
              <Input name="language" defaultValue="en" placeholder="Language code" />
              <Input name="mediaUrl" type="url" placeholder="Video, audio, or document URL" />
              <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="visibility" defaultValue="MEMBERS">
                {["PRIVATE", "LEADERSHIP", "MEMBERS", "PUBLIC"].map((item) => <option key={item}>{item}</option>)}
              </select>
              <Input name="tags" placeholder="Tags, separated by commas" />
              <ScopedSelectors data={data} />
              <Textarea className="md:col-span-2" name="notes" placeholder="Summary, key points, altar call notes, or study guide" />
            </>
          ) : null}

          <Button className="md:col-span-2" disabled={Boolean(busy)} type="submit">
            {busy === mode ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Save {titleCase(mode)}
          </Button>
        </form>
      </section>

      {data.isAdmin ? (
        <section className="flex flex-col gap-3 rounded-lg border border-clay/20 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold">Growth suite audit controls</h2>
            <p className="mt-1 text-sm text-ink/55">Clear logs created by training, prayer, maintenance, campaign, and sermon-resource actions.</p>
          </div>
          <Button disabled={clearingLogs} variant="danger" onClick={() => void clearGrowthLogs()}>
            {clearingLogs ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            Clear growth logs
          </Button>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel title="Training and certificates" icon={<BookOpenCheck className="h-4 w-4" />} loading={loading} empty={!data.programs.length && !data.enrollments.length}>
          {data.programs.map((program) => (
            <Item key={program.id} title={program.title} subtitle={`${program.category} - ${program.level} - ${titleCase(program.status)}`}>
              <div className="mt-2 flex flex-wrap gap-2">
                <Badge>{program.durationMinutes ? `${program.durationMinutes} min` : "Self-paced"}</Badge>
                {data.isAdmin ? (
                  <>
                    <SmallButton onClick={() => void update("TRAINING_PROGRAM", program.id, { status: program.status === "ACTIVE" ? "ARCHIVED" : "ACTIVE" })}>
                      {program.status === "ACTIVE" ? "Archive" : "Restore"}
                    </SmallButton>
                    <IconDelete onClick={() => setDeleteTarget({ entity: "TRAINING_PROGRAM", id: program.id, label: program.title })} />
                  </>
                ) : null}
              </div>
            </Item>
          ))}
          {data.enrollments.map((enrollment) => (
            <Item
              key={enrollment.id}
              title={programsById.get(enrollment.programId) ?? "Training assignment"}
              subtitle={`${usersById.get(enrollment.userId)} - ${titleCase(enrollment.status)} - ${enrollment.progress}%`}
            >
              <div className="mt-2 flex flex-wrap gap-2">
                {enrollment.certificateNumber ? <Badge>{enrollment.certificateNumber}</Badge> : null}
                {data.isAdmin ? (
                  <>
                    {["IN_PROGRESS", "COMPLETED", "REVOKED"].map((status) => (
                      <SmallButton key={status} onClick={() => void update("TRAINING_ENROLLMENT", enrollment.id, { status, progress: status === "COMPLETED" ? 100 : enrollment.progress })}>
                        {titleCase(status)}
                      </SmallButton>
                    ))}
                    <IconDelete onClick={() => setDeleteTarget({ entity: "TRAINING_ENROLLMENT", id: enrollment.id, label: "training enrollment" })} />
                  </>
                ) : null}
              </div>
            </Item>
          ))}
        </Panel>

        <Panel title="Prayer and care requests" icon={<HeartHandshake className="h-4 w-4" />} loading={loading} empty={!data.prayerRequests.length}>
          {data.prayerRequests.map((request) => (
            <Item key={request.id} title={request.title} subtitle={`${titleCase(request.priority)} - ${titleCase(request.status)} - ${titleCase(request.visibility)}`}>
              <p className="mt-1 text-xs text-ink/45">Assigned to {usersById.get(request.assignedToId ?? "") ?? "not assigned"}</p>
              <div className="mt-2 space-y-1">
                {data.prayerNotes.filter((note) => note.prayerRequestId === request.id).slice(0, 3).map((note) => (
                  <p className="rounded-md bg-paper px-3 py-2 text-xs" key={note.id}>{note.body}</p>
                ))}
              </div>
              {data.isAdmin ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {["ASSIGNED", "PRAYED_FOR", "FOLLOW_UP", "CLOSED"].map((status) => (
                    <SmallButton key={status} onClick={() => void update("PRAYER_REQUEST", request.id, { status })}>{titleCase(status)}</SmallButton>
                  ))}
                  <IconDelete onClick={() => setDeleteTarget({ entity: "PRAYER_REQUEST", id: request.id, label: request.title })} />
                </div>
              ) : null}
            </Item>
          ))}
        </Panel>

        <Panel title="Asset maintenance" icon={<Hammer className="h-4 w-4" />} loading={loading} empty={!data.maintenanceTickets.length}>
          {data.maintenanceTickets.map((ticket) => (
            <Item key={ticket.id} title={ticket.title} subtitle={`${ticket.category} - ${titleCase(ticket.priority)} - ${titleCase(ticket.status)}`}>
              <p className="mt-1 text-xs text-ink/45">Assigned to {usersById.get(ticket.assignedToId ?? "") ?? "not assigned"}</p>
              {data.isAdmin ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {["ASSIGNED", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"].map((status) => (
                    <SmallButton key={status} onClick={() => void update("ASSET_MAINTENANCE", ticket.id, { status })}>{titleCase(status)}</SmallButton>
                  ))}
                  <IconDelete onClick={() => setDeleteTarget({ entity: "ASSET_MAINTENANCE", id: ticket.id, label: ticket.title })} />
                </div>
              ) : null}
            </Item>
          ))}
        </Panel>

        <Panel title="Ministry campaigns" icon={<Megaphone className="h-4 w-4" />} loading={loading} empty={!data.campaigns.length}>
          {data.campaigns.map((campaign) => {
            const percent = campaign.goalCount ? Math.min(100, Math.round((campaign.currentCount / campaign.goalCount) * 100)) : 0;
            return (
              <Item key={campaign.id} title={campaign.title} subtitle={`${campaign.campaignType} - ${titleCase(campaign.status)} - ${campaign.currentCount}/${campaign.goalCount ?? "open"}`}>
                <div className="mt-2 h-2 rounded-full bg-paper">
                  <div className="h-2 rounded-full bg-moss" style={{ width: `${percent}%` }} />
                </div>
                <div className="mt-2 space-y-1">
                  {data.campaignUpdates.filter((update) => update.campaignId === campaign.id).slice(0, 3).map((update) => (
                    <p className="rounded-md bg-paper px-3 py-2 text-xs" key={update.id}>{update.body}</p>
                  ))}
                </div>
                {data.isAdmin ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {["ACTIVE", "PAUSED", "COMPLETED", "CANCELLED"].map((status) => (
                      <SmallButton key={status} onClick={() => void update("MINISTRY_CAMPAIGN", campaign.id, { status })}>{titleCase(status)}</SmallButton>
                    ))}
                    <IconDelete onClick={() => setDeleteTarget({ entity: "MINISTRY_CAMPAIGN", id: campaign.id, label: campaign.title })} />
                  </div>
                ) : null}
              </Item>
            );
          })}
        </Panel>

        <Panel title="Sermon and resource library" icon={<Radio className="h-4 w-4" />} loading={loading} empty={!data.sermonResources.length}>
          {data.sermonResources.map((resource) => (
            <Item key={resource.id} title={resource.title} subtitle={`${resource.speaker} - ${resource.scripture ?? "No scripture"} - ${resource.language.toUpperCase()}`}>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge>{titleCase(resource.visibility)}</Badge>
                {resource.mediaUrl ? <a className="text-xs font-medium text-moss underline" href={resource.mediaUrl} rel="noreferrer" target="_blank">Open resource</a> : null}
                {data.isAdmin ? <IconDelete onClick={() => setDeleteTarget({ entity: "SERMON_RESOURCE", id: resource.id, label: resource.title })} /> : null}
              </div>
            </Item>
          ))}
        </Panel>
      </section>

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4">
          <section className="w-full max-w-md rounded-lg border border-ink/10 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="font-semibold">Delete {deleteTarget.label}?</h2>
                <p className="mt-1 text-sm text-ink/60">This will permanently remove the selected growth-suite record and any connected child records.</p>
              </div>
              <button className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-ink/5" type="button" onClick={() => setDeleteTarget(null)}>
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button disabled={busy.startsWith("delete-")} variant="danger" onClick={() => void deleteRecord()}>
                {busy.startsWith("delete-") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete permanently
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function ScopedSelectors({ data }: { data: GrowthData }) {
  return (
    <>
      <Select name="workspaceId" label="Workspace scope" options={data.workspaces.map((item) => [item.id, item.name])} />
      <Select name="organizationUnitId" label="Church network scope" options={data.units.map((item) => [item.id, `${item.type.toLowerCase()}: ${item.name}`])} />
    </>
  );
}

function Select({ label, name, options, required = false }: { label: string; name: string; options: Array<[string, string]>; required?: boolean }) {
  return (
    <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name={name} required={required}>
      <option value="">{label}</option>
      {options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
    </select>
  );
}

function Panel({ children, empty, icon, loading, title }: { children: React.ReactNode; empty: boolean; icon: React.ReactNode; loading: boolean; title: string }) {
  return (
    <section className="rounded-lg border border-ink/10 bg-white">
      <h2 className="flex items-center gap-2 border-b border-ink/10 px-4 py-3 font-semibold">{icon}{title}</h2>
      <div className="max-h-[34rem] divide-y divide-ink/10 overflow-y-auto">
        {loading ? <p className="flex items-center gap-2 px-4 py-8 text-sm text-ink/55"><Loader2 className="h-4 w-4 animate-spin" />Loading</p> : null}
        {!loading && empty ? <p className="px-4 py-8 text-sm text-ink/55">No records yet.</p> : null}
        {children}
      </div>
    </section>
  );
}

function Item({ children, subtitle, title }: { children?: React.ReactNode; subtitle: string; title: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 text-xs text-ink/50">{subtitle}</p>
      {children}
    </div>
  );
}

function SmallButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button className="rounded-md border border-ink/10 px-2 py-1 text-xs hover:bg-mint/50" type="button" onClick={onClick}>
      {children}
    </button>
  );
}

function IconDelete({ onClick }: { onClick: () => void }) {
  return (
    <button
      aria-label="Delete record"
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-clay hover:bg-clay/10"
      type="button"
      onClick={onClick}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
