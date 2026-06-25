"use client";

import {
  AlertTriangle,
  BadgeCheck,
  Bot,
  Building2,
  Copy,
  FileClock,
  Gavel,
  HeartPulse,
  Loader2,
  Plus,
  QrCode,
  RadioTower,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldX,
  UsersRound
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type GlobalData = {
  units: Array<{ id: string; parentId: string | null; type: string; name: string; countryCode: string | null; active: boolean }>;
  leaders: Array<{ id: string; unitId: string; userId: string; title: string; canCreateWorkspaces: boolean; inheritToChildren: boolean }>;
  users: Array<{
    id: string;
    name: string | null;
    email: string | null;
    image: string | null;
    memberProfile: {
      membershipNumber: string | null;
      membershipStartedAt: string | null;
      membershipStatus: string;
      organizationPosition: string | null;
      digitalIdLocation: string;
    } | null;
  }>;
  workspaces: Array<{ id: string; name: string; organizationUnitId: string | null; scopeType: string | null }>;
  safeguardingCases: Array<{ id: string; reference: string; subjectName: string; category: string; severity: string; status: string; createdAt: string }>;
  aiAgents: Array<{ id: string; name: string; description: string | null; workspaceId: string | null; enabled: boolean; allowedSourceTypes: unknown }>;
  freshnessIssues: Array<{ id: string; title: string; sourceType: string; issueType: string; status: string; details: string | null }>;
  safetyCases: Array<{ id: string; sourceType: string; category: string; severity: string; status: string; summary: string }>;
  emergencies: Array<{ id: string; title: string; instructions: string; severity: string; status: string; location: string | null; createdAt: string }>;
  emergencyResponseCounts: Array<{ incidentId: string; status: string; _count: { _all: number } }>;
  cards: Array<{
    id: string;
    userId: string;
    cardNumber: string;
    organizationId: string;
    status: string;
    issuedAt: string;
    expiresAt: string | null;
  }>;
  identityVerifications: Array<{ id: string; cardId: string | null; organizationId: string | null; outcome: string; createdAt: string }>;
  holds: Array<{ id: string; name: string; targetType: string; targetId: string; reason: string; status: string; preserveUntil: string | null }>;
  resources: Array<{ id: string; name: string; category: string; location: string | null }>;
  resourcePasses: Array<{ id: string; resourceId: string; enabled: boolean }>;
  resourceCheckIns: Array<{ id: string; resourceId: string; userId: string; status: string; checkedInAt: string; checkedOutAt: string | null }>;
};

type Tab = "network" | "safeguarding" | "agents" | "freshness" | "safety" | "emergency" | "cards" | "governance" | "resources";

const emptyData: GlobalData = {
  units: [],
  leaders: [],
  users: [],
  workspaces: [],
  safeguardingCases: [],
  aiAgents: [],
  freshnessIssues: [],
  safetyCases: [],
  emergencies: [],
  emergencyResponseCounts: [],
  cards: [],
  identityVerifications: [],
  holds: [],
  resources: [],
  resourcePasses: [],
  resourceCheckIns: []
};

const tabs: Array<{ id: Tab; label: string; icon: typeof Building2 }> = [
  { id: "network", label: "Church network", icon: Building2 },
  { id: "safeguarding", label: "Pastoral safety", icon: HeartPulse },
  { id: "agents", label: "AI agents", icon: Bot },
  { id: "freshness", label: "Freshness", icon: FileClock },
  { id: "safety", label: "Communication safety", icon: ShieldAlert },
  { id: "emergency", label: "Emergency", icon: RadioTower },
  { id: "cards", label: "Membership cards", icon: BadgeCheck },
  { id: "governance", label: "Legal hold", icon: Gavel },
  { id: "resources", label: "Smart resources", icon: QrCode }
];

function selectClassName() {
  return "h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm outline-none focus:border-moss";
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-ink/10 bg-white">
      <h2 className="border-b border-ink/10 px-4 py-3 text-sm font-semibold">{title}</h2>
      <div className="p-4">{children}</div>
    </section>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md bg-paper px-4 py-6 text-sm text-ink/55">{children}</p>;
}

export function GlobalOperationsPanel() {
  const [data, setData] = useState<GlobalData>(emptyData);
  const [tab, setTab] = useState<Tab>("network");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const userName = useMemo(
    () => new Map(data.users.map((user) => [user.id, user.name ?? user.email ?? "Member"])),
    [data.users]
  );
  const unitName = useMemo(() => new Map(data.units.map((unit) => [unit.id, unit.name])), [data.units]);
  const workspaceName = useMemo(
    () => new Map(data.workspaces.map((workspace) => [workspace.id, workspace.name])),
    [data.workspaces]
  );
  const resourceName = useMemo(
    () => new Map(data.resources.map((resource) => [resource.id, resource.name])),
    [data.resources]
  );

  async function load() {
    setLoading(true);
    const response = await fetch("/api/admin/global-operations");
    const body = (await response.json().catch(() => null)) as (GlobalData & { error?: string }) | null;
    setLoading(false);
    if (!response.ok || !body) {
      setError(body?.error ?? "Global church controls could not be loaded.");
      return;
    }
    setData(body);
  }

  useEffect(() => {
    void load();
  }, []);

  async function mutate(method: "POST" | "PATCH" | "DELETE", payload: Record<string, unknown>, success: string) {
    setBusy(true);
    setError("");
    setMessage("");
    const response = await fetch("/api/admin/global-operations", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!response.ok) {
      setError(body?.error ?? "The administrative operation failed.");
      return false;
    }
    setMessage(success);
    await load();
    return true;
  }

  async function submitForm(
    event: FormEvent<HTMLFormElement>,
    entity: string,
    success: string,
    transform?: (values: Record<string, FormDataEntryValue>) => Record<string, unknown>
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const payload = transform ? transform(values) : values;
    if (await mutate("POST", { entity, ...payload }, success)) form.reset();
  }

  if (loading && !data.units.length) {
    return <div className="flex items-center justify-center rounded-lg border border-ink/10 bg-white p-16"><Loader2 className="h-6 w-6 animate-spin text-moss" /></div>;
  }

  return (
    <div className="space-y-5">
      {error ? <p className="rounded-md bg-clay/10 px-4 py-3 text-sm text-clay">{error}</p> : null}
      {message ? <p className="rounded-md bg-mint px-4 py-3 text-sm text-moss">{message}</p> : null}

      <nav className="flex gap-1 overflow-x-auto rounded-lg border border-ink/10 bg-white p-2" aria-label="Global controls">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium ${tab === id ? "bg-moss text-white" : "text-ink/65 hover:bg-mint/45"}`}
            key={id}
            onClick={() => setTab(id)}
            type="button"
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {tab === "network" ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <FormSection title="Create country, region, branch, church, or ministry">
            <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => submitForm(event, "UNIT", "Organization unit created.", (values) => ({
              ...values,
              parentId: values.parentId || null,
              code: values.code || null,
              countryCode: values.countryCode || null
            }))}>
              <select className={selectClassName()} name="type" required>
                {["GLOBAL", "COUNTRY", "REGION", "BRANCH", "CHURCH", "MINISTRY"].map((type) => <option key={type}>{type}</option>)}
              </select>
              <Input name="name" placeholder="Name" required />
              <select className={selectClassName()} name="parentId">
                <option value="">No parent</option>
                {data.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.type.toLowerCase()}: {unit.name}</option>)}
              </select>
              <Input name="countryCode" placeholder="Country code, e.g. GB" maxLength={2} />
              <Input name="code" placeholder="Internal code" />
              <Input name="description" placeholder="Description" />
              <Button className="md:col-span-2" disabled={busy} type="submit"><Plus className="h-4 w-4" />Create network unit</Button>
            </form>
          </FormSection>

          <FormSection title="Assign a leader across this scope">
            <form className="grid gap-3 md:grid-cols-2" onSubmit={(event) => submitForm(event, "LEADER", "Network leader assigned.", (values) => ({
              ...values,
              canCreateWorkspaces: values.canCreateWorkspaces === "on",
              inheritToChildren: values.inheritToChildren === "on"
            }))}>
              <select className={selectClassName()} name="unitId" required>
                <option value="">Choose network unit</option>
                {data.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select>
              <select className={selectClassName()} name="userId" required>
                <option value="">Choose member</option>
                {data.users.map((user) => <option key={user.id} value={user.id}>{user.name ?? user.email}</option>)}
              </select>
              <Input name="title" placeholder="Regional leader, pastor, coordinator..." required />
              <label className="flex h-10 items-center gap-2 rounded-md border border-ink/10 px-3 text-sm">
                <input defaultChecked name="canCreateWorkspaces" type="checkbox" /> Can create workspaces
              </label>
              <label className="flex h-10 items-center gap-2 rounded-md border border-ink/10 px-3 text-sm md:col-span-2">
                <input defaultChecked name="inheritToChildren" type="checkbox" /> Authority extends to child regions, churches, and ministries
              </label>
              <Button className="md:col-span-2" disabled={busy} type="submit"><UsersRound className="h-4 w-4" />Assign leader</Button>
            </form>
          </FormSection>

          <FormSection title={`Network structure (${data.units.length})`}>
            <div className="max-h-[30rem] divide-y divide-ink/10 overflow-y-auto">
              {data.units.length === 0 ? <EmptyState>Create the global LETW unit first, then countries and their child regions.</EmptyState> : null}
              {data.units.map((unit) => (
                <div className="flex items-center justify-between gap-3 py-3" key={unit.id}>
                  <div>
                    <p className="text-sm font-medium">{unit.name}</p>
                    <p className="text-xs text-ink/45">{unit.type.toLowerCase()} {unit.countryCode ? `- ${unit.countryCode}` : ""}</p>
                  </div>
                  <Badge>{unit.parentId ? `under ${unitName.get(unit.parentId) ?? "network"}` : "top level"}</Badge>
                </div>
              ))}
            </div>
          </FormSection>

          <FormSection title={`Assigned leaders (${data.leaders.length})`}>
            <div className="max-h-[30rem] divide-y divide-ink/10 overflow-y-auto">
              {data.leaders.length === 0 ? <EmptyState>No cross-region leaders assigned.</EmptyState> : null}
              {data.leaders.map((leader) => (
                <div className="py-3" key={leader.id}>
                  <p className="text-sm font-medium">{userName.get(leader.userId)} - {leader.title}</p>
                  <p className="text-xs text-ink/45">{unitName.get(leader.unitId) ?? "Network unit"} - {leader.inheritToChildren ? "includes child scopes" : "this scope only"} - {leader.canCreateWorkspaces ? "workspace creation enabled" : "read leadership"}</p>
                </div>
              ))}
            </div>
          </FormSection>
        </div>
      ) : null}

      {tab === "safeguarding" ? (
        <div className="grid gap-5 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <FormSection title="Open a restricted safeguarding case">
            <form className="space-y-3" onSubmit={(event) => submitForm(event, "SAFEGUARDING", "Safeguarding case created.", (values) => ({
              ...values,
              organizationUnitId: values.organizationUnitId || null,
              workspaceId: values.workspaceId || null,
              subjectUserId: values.subjectUserId || null,
              assignedToId: values.assignedToId || null,
              nextReviewAt: values.nextReviewAt ? new Date(String(values.nextReviewAt)).toISOString() : null
            }))}>
              <Input name="subjectName" placeholder="Person or confidential reference" required />
              <Input name="category" placeholder="Category" required />
              <select className={selectClassName()} name="severity" required>
                {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((value) => <option key={value}>{value}</option>)}
              </select>
              <select className={selectClassName()} name="organizationUnitId"><option value="">Organization-wide</option>{data.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select>
              <select className={selectClassName()} name="workspaceId"><option value="">No workspace</option>{data.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select>
              <select className={selectClassName()} name="assignedToId"><option value="">Unassigned reviewer</option>{data.users.map((user) => <option key={user.id} value={user.id}>{user.name ?? user.email}</option>)}</select>
              <Textarea name="summary" placeholder="Restricted factual summary" required />
              <Textarea name="privateNotes" placeholder="Private reviewer notes, excluded from AI" />
              <Input name="nextReviewAt" type="datetime-local" />
              <Button className="w-full" disabled={busy} type="submit"><HeartPulse className="h-4 w-4" />Create restricted case</Button>
            </form>
          </FormSection>
          <FormSection title={`Restricted cases (${data.safeguardingCases.length})`}>
            <div className="divide-y divide-ink/10">
              {data.safeguardingCases.length === 0 ? <EmptyState>No safeguarding cases recorded.</EmptyState> : null}
              {data.safeguardingCases.map((item) => (
                <div className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between" key={item.id}>
                  <div>
                    <p className="text-sm font-medium">{item.reference} - {item.subjectName}</p>
                    <p className="text-xs text-ink/50">{item.category} - {item.severity.toLowerCase()} - created {new Date(item.createdAt).toLocaleDateString()}</p>
                  </div>
                  <select className={`${selectClassName()} md:w-40`} value={item.status} onChange={(event) => void mutate("PATCH", { entity: "SAFEGUARDING", id: item.id, status: event.target.value }, "Safeguarding case updated.")}>
                    {["OPEN", "TRIAGE", "ACTIVE", "MONITORING", "CLOSED"].map((status) => <option key={status}>{status}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </FormSection>
        </div>
      ) : null}

      {tab === "agents" ? (
        <div className="grid gap-5 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <FormSection title="Create a source-scoped AI agent">
            <form className="space-y-3" onSubmit={(event) => submitForm(event, "AI_AGENT", "Specialized AI agent created.", (values) => ({
              name: values.name,
              description: values.description || null,
              instructions: values.instructions,
              workspaceId: values.workspaceId || null,
              organizationUnitId: values.organizationUnitId || null,
              allowedSourceTypes: String(values.allowedSourceTypes).split(",").filter(Boolean)
            }))}>
              <Input name="name" placeholder="Finance AI, Policy AI, Event AI..." required />
              <Input name="description" placeholder="Short purpose" />
              <Textarea name="instructions" placeholder="Define how the agent should answer and what it must avoid." required />
              <select className={selectClassName()} name="workspaceId"><option value="">No single workspace</option>{data.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select>
              <select className={selectClassName()} name="organizationUnitId"><option value="">No network scope</option>{data.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select>
              <select className={selectClassName()} defaultValue="announcement,task,knowledge,meeting,policy,file" name="allowedSourceTypes">
                <option value="announcement,task,knowledge,meeting,policy,file">Approved records and documents</option>
                <option value="policy,file">Policies and files only</option>
                <option value="meeting,task">Meetings and tasks only</option>
                <option value="announcement,knowledge">Announcements and knowledge only</option>
              </select>
              <Button className="w-full" disabled={busy} type="submit"><Bot className="h-4 w-4" />Create AI agent</Button>
            </form>
          </FormSection>
          <FormSection title={`Specialized agents (${data.aiAgents.length})`}>
            <div className="divide-y divide-ink/10">
              {data.aiAgents.length === 0 ? <EmptyState>No specialized agents yet.</EmptyState> : null}
              {data.aiAgents.map((agent) => (
                <div className="flex items-center justify-between gap-3 py-3" key={agent.id}>
                  <div>
                    <p className="text-sm font-medium">{agent.name}</p>
                    <p className="text-xs text-ink/50">{agent.description ?? "No description"} - {agent.workspaceId ? workspaceName.get(agent.workspaceId) : "organization scope"}</p>
                  </div>
                  <Button variant="secondary" disabled={busy} onClick={() => void mutate("PATCH", { entity: "AI_AGENT", id: agent.id, enabled: !agent.enabled }, `Agent ${agent.enabled ? "disabled" : "enabled"}.`)}>
                    {agent.enabled ? "Disable" : "Enable"}
                  </Button>
                </div>
              ))}
            </div>
          </FormSection>
        </div>
      ) : null}

      {tab === "freshness" ? (
        <FormSection title="Content Freshness Guardian">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-sm text-ink/60">Find stale files, duplicate filenames, old knowledge pages, and published policies due for annual review.</p>
            <Button disabled={busy} onClick={() => void mutate("POST", { entity: "FRESHNESS_SCAN" }, "Content freshness scan completed.")}><RefreshCw className="h-4 w-4" />Scan approved content</Button>
          </div>
          <div className="mt-4 divide-y divide-ink/10">
            {data.freshnessIssues.length === 0 ? <EmptyState>No open freshness issues. Run a scan to review the content estate.</EmptyState> : null}
            {data.freshnessIssues.map((issue) => (
              <div className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between" key={issue.id}>
                <div><p className="text-sm font-medium">{issue.title}</p><p className="text-xs text-ink/50">{issue.sourceType.toLowerCase()} - {issue.issueType.toLowerCase().replaceAll("_", " ")} - {issue.details}</p></div>
                <select className={`${selectClassName()} md:w-36`} value={issue.status} onChange={(event) => void mutate("PATCH", { entity: "FRESHNESS", id: issue.id, status: event.target.value }, "Freshness issue updated.")}>
                  {["OPEN", "REVIEWED", "RESOLVED", "DISMISSED"].map((status) => <option key={status}>{status}</option>)}
                </select>
              </div>
            ))}
          </div>
        </FormSection>
      ) : null}

      {tab === "safety" ? (
        <FormSection title="Communication Safety Center">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-sm text-ink/60">Private, rule-based review flags potential threats, harassment, confidential-data sharing, self-harm, or safeguarding language. It does not expose flagged content to AI.</p>
            <Button disabled={busy} onClick={() => void mutate("POST", { entity: "SAFETY_SCAN" }, "Communication safety scan completed.")}><ShieldAlert className="h-4 w-4" />Scan recent chat</Button>
          </div>
          <div className="mt-4 divide-y divide-ink/10">
            {data.safetyCases.length === 0 ? <EmptyState>No communication safety cases detected.</EmptyState> : null}
            {data.safetyCases.map((item) => (
              <div className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between" key={item.id}>
                <div><p className="text-sm font-medium">{item.category.toLowerCase().replaceAll("_", " ")} - {item.severity.toLowerCase()}</p><p className="text-xs text-ink/50">{item.summary}</p></div>
                <select className={`${selectClassName()} md:w-36`} value={item.status} onChange={(event) => void mutate("PATCH", { entity: "SAFETY", id: item.id, status: event.target.value }, "Safety case updated.")}>
                  {["OPEN", "REVIEWING", "RESOLVED", "DISMISSED"].map((status) => <option key={status}>{status}</option>)}
                </select>
              </div>
            ))}
          </div>
        </FormSection>
      ) : null}

      {tab === "emergency" ? (
        <div className="grid gap-5 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <FormSection title="Create emergency broadcast">
            <form className="space-y-3" onSubmit={(event) => submitForm(event, "EMERGENCY", "Emergency incident created.", (values) => ({
              ...values,
              organizationUnitId: values.organizationUnitId || null,
              workspaceId: values.workspaceId || null,
              location: values.location || null,
              activateNow: values.activateNow === "on"
            }))}>
              <Input name="title" placeholder="Emergency title" required />
              <Textarea name="instructions" placeholder="Clear instructions for members" required />
              <select className={selectClassName()} name="severity">{["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((value) => <option key={value}>{value}</option>)}</select>
              <Input name="location" placeholder="Location or affected area" />
              <select className={selectClassName()} name="organizationUnitId"><option value="">All LETW members</option>{data.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}</select>
              <select className={selectClassName()} name="workspaceId"><option value="">No single workspace</option>{data.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select>
              <label className="flex items-center gap-2 text-sm"><input name="activateNow" type="checkbox" /> Broadcast immediately with urgent notifications</label>
              <Button className="w-full" disabled={busy} type="submit"><RadioTower className="h-4 w-4" />Create incident</Button>
            </form>
          </FormSection>
          <FormSection title={`Emergency command center (${data.emergencies.length})`}>
            <div className="divide-y divide-ink/10">
              {data.emergencies.length === 0 ? <EmptyState>No emergency incidents recorded.</EmptyState> : null}
              {data.emergencies.map((incident) => {
                const responses = data.emergencyResponseCounts.filter((item) => item.incidentId === incident.id);
                return (
                  <div className="py-3" key={incident.id}>
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div><p className="text-sm font-medium">{incident.title}</p><p className="text-xs text-ink/50">{incident.severity.toLowerCase()} - {incident.location ?? "all locations"} - {incident.instructions}</p></div>
                      <select className={`${selectClassName()} md:w-36`} value={incident.status} onChange={(event) => void mutate("PATCH", { entity: "EMERGENCY", id: incident.id, status: event.target.value }, "Emergency incident updated.")}>
                        {["DRAFT", "ACTIVE", "RESOLVED", "CANCELLED"].map((status) => <option key={status}>{status}</option>)}
                      </select>
                    </div>
                    <p className="mt-2 text-xs text-ink/45">{responses.map((item) => `${item.status.toLowerCase().replaceAll("_", " ")}: ${item._count._all}`).join(" - ") || "No welfare responses yet"}</p>
                  </div>
                );
              })}
            </div>
          </FormSection>
        </div>
      ) : null}

      {tab === "cards" ? (
        <div className="grid gap-5 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <FormSection title="Issue or renew digital membership card">
            <form className="space-y-3" onSubmit={(event) => submitForm(event, "MEMBERSHIP_CARD", "Digital membership card issued.", (values) => ({
              userId: values.userId,
              expiresAt: values.expiresAt ? new Date(String(values.expiresAt)).toISOString() : null
            }))}>
              <select className={selectClassName()} name="userId" required><option value="">Choose member</option>{data.users.map((user) => <option key={user.id} value={user.id}>{user.name ?? user.email}</option>)}</select>
              <Input name="expiresAt" type="date" />
              <Button className="w-full" disabled={busy} type="submit"><BadgeCheck className="h-4 w-4" />Issue secure card</Button>
            </form>
          </FormSection>
          <FormSection title={`Issued cards (${data.cards.length})`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-ink/10 bg-paper p-3">
              <div>
                <p className="text-sm font-medium">QR authentication history</p>
                <p className="text-xs text-ink/50">{data.identityVerifications.length} recent verification records</p>
              </div>
              <Button
                variant="danger"
                disabled={busy || data.identityVerifications.length === 0}
                onClick={() => {
                  if (!window.confirm("Clear all Digital ID QR verification history?")) return;
                  void mutate(
                    "DELETE",
                    {
                      entity: "IDENTITY_VERIFICATIONS",
                      confirmation: "CLEAR QR VERIFICATION LOG"
                    },
                    "QR verification history cleared."
                  );
                }}
              >
                <ShieldX className="h-4 w-4" />
                Clear QR scan log
              </Button>
            </div>
            <div className="divide-y divide-ink/10">
              {data.cards.length === 0 ? <EmptyState>No digital cards issued.</EmptyState> : null}
              {data.cards.map((card) => {
                const cardUser = data.users.find((item) => item.id === card.userId);
                const profile = cardUser?.memberProfile;
                return (
                  <div className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between" key={card.id}>
                    <div>
                      <p className="text-sm font-medium">{userName.get(card.userId)}</p>
                      <p className="text-xs font-semibold text-moss">{card.organizationId}</p>
                      <p className="mt-1 text-xs text-ink/55">
                        Member no. {profile?.membershipNumber ?? "Pending"} - {profile?.organizationPosition ?? "Member"} -{" "}
                        {profile?.digitalIdLocation ?? "LETTW Worldwide"}
                      </p>
                      <p className="text-xs text-ink/45">
                        {card.cardNumber} - issued {new Date(card.issuedAt).toLocaleDateString()} -{" "}
                        {card.expiresAt ? `expires ${new Date(card.expiresAt).toLocaleDateString()}` : "no expiry"} -{" "}
                        {data.identityVerifications.filter((item) => item.cardId === card.id).length} recent scans
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" disabled={busy} onClick={() => { void navigator.clipboard.writeText(card.organizationId); setMessage("Organization ID copied."); }}><Copy className="h-4 w-4" />Copy ID</Button>
                      {card.status === "REVOKED" ? (
                        <>
                          <Button
                            variant="secondary"
                            disabled={busy}
                            onClick={() =>
                              void mutate(
                                "PATCH",
                                { entity: "MEMBERSHIP_CARD", id: card.id, operation: "REISSUE" },
                                "Digital ID reissued. The new QR code is active and the old code is invalid."
                              )
                            }
                          >
                            <RotateCcw className="h-4 w-4" />
                            Reissue QR
                          </Button>
                          <Button
                            variant="danger"
                            disabled={busy}
                            onClick={() => {
                              if (!window.confirm("Permanently remove this revoked Digital ID from the active register?")) return;
                              void mutate(
                                "PATCH",
                                { entity: "MEMBERSHIP_CARD", id: card.id, operation: "DELETE" },
                                "Revoked Digital ID and its QR scan history deleted."
                              );
                            }}
                          >
                            <ShieldX className="h-4 w-4" />
                            Delete revoked QR
                          </Button>
                        </>
                      ) : (
                        <Button
                          variant="danger"
                          disabled={busy}
                          onClick={() => {
                            if (!window.confirm("Revoke this Digital ID immediately? Its current QR code will fail verification.")) return;
                            void mutate(
                              "PATCH",
                              { entity: "MEMBERSHIP_CARD", id: card.id, operation: "REVOKE" },
                              "Digital ID revoked. Its QR code is no longer accepted."
                            );
                          }}
                        >
                          <ShieldX className="h-4 w-4" />
                          Revoke
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </FormSection>
        </div>
      ) : null}

      {tab === "governance" ? (
        <div className="grid gap-5 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <FormSection title="Create governance or legal hold">
            <form className="space-y-3" onSubmit={(event) => submitForm(event, "GOVERNANCE_HOLD", "Governance hold applied.", (values) => ({
              ...values,
              preserveUntil: values.preserveUntil ? new Date(String(values.preserveUntil)).toISOString() : null
            }))}>
              <Input name="name" placeholder="Investigation or preservation name" required />
              <select className={selectClassName()} name="targetType"><option value="WORKSPACE">Workspace</option><option value="FILE">Document ID</option></select>
              <Input name="targetId" placeholder="Workspace or document ID" required />
              <Textarea name="reason" placeholder="Reason and authority for preservation" required />
              <Input name="preserveUntil" type="date" />
              <Button className="w-full" disabled={busy} type="submit"><Gavel className="h-4 w-4" />Apply deletion hold</Button>
            </form>
          </FormSection>
          <FormSection title={`Governance holds (${data.holds.length})`}>
            <div className="divide-y divide-ink/10">
              {data.holds.length === 0 ? <EmptyState>No active or released holds.</EmptyState> : null}
              {data.holds.map((hold) => (
                <div className="flex flex-col gap-3 py-3 md:flex-row md:items-center md:justify-between" key={hold.id}>
                  <div><p className="text-sm font-medium">{hold.name}</p><p className="text-xs text-ink/50">{hold.targetType.toLowerCase()} - {hold.reason} - {hold.status.toLowerCase()}</p></div>
                  {hold.status === "ACTIVE" ? <Button variant="secondary" disabled={busy} onClick={() => void mutate("PATCH", { entity: "GOVERNANCE_HOLD", id: hold.id, status: "RELEASED" }, "Governance hold released.")}>Release hold</Button> : <Badge>released</Badge>}
                </div>
              ))}
            </div>
          </FormSection>
        </div>
      ) : null}

      {tab === "resources" ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <FormSection title="QR-enabled rooms, vehicles, and equipment">
            <div className="divide-y divide-ink/10">
              {data.resources.length === 0 ? <EmptyState>Create resources in Church Operations first.</EmptyState> : null}
              {data.resources.map((resource) => (
                <div className="flex items-center justify-between gap-3 py-3" key={resource.id}>
                  <div><p className="text-sm font-medium">{resource.name}</p><p className="text-xs text-ink/50">{resource.category} - {resource.location ?? "location not set"}</p></div>
                  <a className="inline-flex h-10 items-center gap-2 rounded-md border border-ink/10 bg-white px-3 text-sm font-medium hover:bg-mint/45" href={`/api/resources/${resource.id}/qr`} target="_blank" rel="noreferrer"><QrCode className="h-4 w-4" />Open QR</a>
                </div>
              ))}
            </div>
          </FormSection>
          <FormSection title={`Recent check-ins (${data.resourceCheckIns.length})`}>
            <div className="max-h-[32rem] divide-y divide-ink/10 overflow-y-auto">
              {data.resourceCheckIns.length === 0 ? <EmptyState>No resource check-ins yet.</EmptyState> : null}
              {data.resourceCheckIns.map((checkIn) => (
                <div className="py-3" key={checkIn.id}>
                  <p className="text-sm font-medium">{resourceName.get(checkIn.resourceId) ?? "Resource"} - {userName.get(checkIn.userId) ?? "Member"}</p>
                  <p className="text-xs text-ink/50">{checkIn.status.toLowerCase().replaceAll("_", " ")} - {new Date(checkIn.checkedInAt).toLocaleString()}</p>
                </div>
              ))}
            </div>
          </FormSection>
        </div>
      ) : null}

      {busy ? <div className="fixed bottom-5 right-5 flex items-center gap-2 rounded-md bg-ink px-4 py-3 text-sm text-white shadow-xl"><Loader2 className="h-4 w-4 animate-spin" />Applying protected operation</div> : null}
      {tab === "emergency" ? <p className="flex items-center gap-2 text-xs text-ink/45"><AlertTriangle className="h-4 w-4" />Emergency broadcasts send urgent in-app notifications only to the selected authorized scope.</p> : null}
    </div>
  );
}
