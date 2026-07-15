"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  CalendarCheck2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRoundPlus
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";

type Option = { id: string; name?: string | null; email?: string | null; fileName?: string | null; type?: string; kind?: string; category?: string | null; workspaceId?: string | null };
type PrayerAssignment = { id: string; title: string; prayerPoint: string; status: string; priority: string; dueAt?: string | null; assignedToUserId?: string | null; assignedWorkspaceId?: string | null; testimony?: string | null; createdAt: string };
type CalendarConflict = { id: string; title: string; details: string; conflictType: string; severity: string; status: string; startsAt: string; endsAt: string };
type ExternalGuest = { id: string; name: string; email: string; guestType: string; purpose: string; status: string; workspaceId?: string | null; fileId?: string | null; token: string; expiresAt: string; revokedAt?: string | null };
type Delegation = { id: string; delegatedToId: string; status: string; expiresAt: string; canIssueCertificates: boolean; canIssueIdCards: boolean; canIssueLetters: boolean; canManagePrayerAssignments: boolean; canResolveCalendarConflicts: boolean; canManageExternalGuests: boolean; canRunSystemCleanup: boolean; reason?: string | null };
type CleanupPreview = { workspaceAccess: number; fileAccess: number; shareLinks: number; issuanceGrants: number; oldDevices: number; delegationsExpired: number; guestsExpired: number; staleAccessRequests: number; total: number };
type CenterData = {
  users: Option[];
  workspaces: Option[];
  files: Option[];
  units: Option[];
  departments: Option[];
  resources: Option[];
  prayerAssignments: PrayerAssignment[];
  calendarConflicts: CalendarConflict[];
  externalGuests: ExternalGuest[];
  delegations: Delegation[];
  cleanupPreview: CleanupPreview;
};

const emptyData: CenterData = {
  users: [],
  workspaces: [],
  files: [],
  units: [],
  departments: [],
  resources: [],
  prayerAssignments: [],
  calendarConflicts: [],
  externalGuests: [],
  delegations: [],
  cleanupPreview: {
    workspaceAccess: 0,
    fileAccess: 0,
    shareLinks: 0,
    issuanceGrants: 0,
    oldDevices: 0,
    delegationsExpired: 0,
    guestsExpired: 0,
    staleAccessRequests: 0,
    total: 0
  }
};

function toIso(value: string) {
  return value ? new Date(value).toISOString() : null;
}

function userName(users: Option[], id?: string | null) {
  const user = users.find((item) => item.id === id);
  return user?.name || user?.email || "Unassigned";
}

function workspaceName(workspaces: Option[], id?: string | null) {
  return workspaces.find((item) => item.id === id)?.name ?? "No workspace";
}

export function ExecutiveOperationsPanel() {
  const [data, setData] = useState<CenterData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [guestUrl, setGuestUrl] = useState("");
  const [prayerForm, setPrayerForm] = useState({
    title: "",
    prayerPoint: "",
    category: "GENERAL",
    priority: "NORMAL",
    assignedToUserId: "",
    assignedWorkspaceId: "",
    assignedOrganizationUnitId: "",
    assignedDepartmentId: "",
    dueAt: ""
  });
  const [guestForm, setGuestForm] = useState({
    name: "",
    email: "",
    organization: "",
    guestType: "AUDITOR",
    purpose: "",
    workspaceId: "",
    fileId: "",
    expiresAt: ""
  });
  const [delegationForm, setDelegationForm] = useState({
    delegatedToId: "",
    expiresAt: "",
    reason: "",
    canIssueCertificates: false,
    canIssueIdCards: false,
    canIssueLetters: false,
    canManagePrayerAssignments: true,
    canResolveCalendarConflicts: true,
    canManageExternalGuests: true,
    canRunSystemCleanup: false
  });

  const pendingPrayer = useMemo(() => data.prayerAssignments.filter((item) => !["COMPLETED", "TESTIMONY_RECORDED", "CANCELLED"].includes(item.status)).length, [data.prayerAssignments]);
  const openConflicts = useMemo(() => data.calendarConflicts.filter((item) => item.status === "OPEN").length, [data.calendarConflicts]);
  const activeGuests = useMemo(() => data.externalGuests.filter((item) => item.status === "ACTIVE" && new Date(item.expiresAt) > new Date()).length, [data.externalGuests]);
  const activeDelegations = useMemo(() => data.delegations.filter((item) => item.status === "ACTIVE" && new Date(item.expiresAt) > new Date()).length, [data.delegations]);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/admin/executive-operations");
    const body = (await response.json().catch(() => null)) as (CenterData & { error?: string }) | null;
    setLoading(false);
    if (!response.ok || !body) {
      setError(body?.error ?? "Executive operations could not be loaded.");
      return;
    }
    setData(body);
  }

  useEffect(() => {
    void load();
  }, []);

  async function request(method: "POST" | "PATCH" | "DELETE", payload: Record<string, unknown>, success: string) {
    setBusy(`${method}-${String(payload.entity)}`);
    setNotice("");
    setError("");
    const response = await fetch("/api/admin/executive-operations", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = (await response.json().catch(() => null)) as { error?: string; portalUrl?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(body?.error ?? "Action failed.");
      return;
    }
    if (body?.portalUrl) setGuestUrl(body.portalUrl);
    setNotice(success);
    await load();
  }

  async function createPrayer() {
    await request("POST", {
      entity: "PRAYER_ASSIGNMENT",
      ...prayerForm,
      assignedToUserId: prayerForm.assignedToUserId || null,
      assignedWorkspaceId: prayerForm.assignedWorkspaceId || null,
      assignedOrganizationUnitId: prayerForm.assignedOrganizationUnitId || null,
      assignedDepartmentId: prayerForm.assignedDepartmentId || null,
      dueAt: toIso(prayerForm.dueAt)
    }, "Prayer assignment created.");
    setPrayerForm((current) => ({ ...current, title: "", prayerPoint: "" }));
  }

  async function createGuest() {
    await request("POST", {
      entity: "EXTERNAL_GUEST",
      ...guestForm,
      workspaceId: guestForm.workspaceId || null,
      fileId: guestForm.fileId || null,
      expiresAt: toIso(guestForm.expiresAt)
    }, "External guest portal created.");
    setGuestForm((current) => ({ ...current, name: "", email: "", organization: "", purpose: "" }));
  }

  async function createDelegation() {
    await request("POST", {
      entity: "PRESIDENT_DELEGATION",
      ...delegationForm,
      expiresAt: toIso(delegationForm.expiresAt)
    }, "President delegation granted.");
  }

  return (
    <div className="space-y-6">
      {notice ? <p className="rounded-md border border-moss/15 bg-mint px-4 py-3 text-sm text-moss">{notice}</p> : null}
      {error ? <p className="rounded-md bg-clay/10 px-4 py-3 text-sm text-clay">{error}</p> : null}

      <section className="grid gap-4 md:grid-cols-5">
        <Metric label="Prayer assignments" value={pendingPrayer} />
        <Metric label="Calendar conflicts" value={openConflicts} />
        <Metric label="External guests" value={activeGuests} />
        <Metric label="Delegations" value={activeDelegations} />
        <Metric label="Cleanup candidates" value={data.cleanupPreview.total} />
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel title="Prayer Assignment System" icon={<Sparkles className="h-4 w-4" />}>
          <div className="grid gap-3 md:grid-cols-2">
            <Input placeholder="Prayer assignment title" value={prayerForm.title} onChange={(event) => setPrayerForm({ ...prayerForm, title: event.target.value })} />
            <Input placeholder="Category" value={prayerForm.category} onChange={(event) => setPrayerForm({ ...prayerForm, category: event.target.value })} />
            <Select value={prayerForm.priority} onChange={(value) => setPrayerForm({ ...prayerForm, priority: value })}>
              <option value="LOW">Low priority</option>
              <option value="NORMAL">Normal priority</option>
              <option value="HIGH">High priority</option>
              <option value="URGENT">Urgent priority</option>
            </Select>
            <Input type="datetime-local" value={prayerForm.dueAt} onChange={(event) => setPrayerForm({ ...prayerForm, dueAt: event.target.value })} />
            <Select value={prayerForm.assignedToUserId} onChange={(value) => setPrayerForm({ ...prayerForm, assignedToUserId: value })}>
              <option value="">Assign to intercessor/user</option>
              {data.users.map((user) => <option key={user.id} value={user.id}>{user.name || user.email}</option>)}
            </Select>
            <Select value={prayerForm.assignedWorkspaceId} onChange={(value) => setPrayerForm({ ...prayerForm, assignedWorkspaceId: value })}>
              <option value="">Assign to workspace/team</option>
              {data.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
            </Select>
          </div>
          <Textarea className="mt-3" placeholder="Prayer point, instructions, notes, scriptures, or expected follow-up" value={prayerForm.prayerPoint} onChange={(event) => setPrayerForm({ ...prayerForm, prayerPoint: event.target.value })} />
          <Button className="mt-3" disabled={Boolean(busy) || !prayerForm.title || !prayerForm.prayerPoint} onClick={() => void createPrayer()}>Create prayer assignment</Button>
          <RecordList empty="No prayer assignments yet." loading={loading}>
            {data.prayerAssignments.slice(0, 8).map((item) => (
              <div className="rounded-md border border-ink/10 p-3" key={item.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{item.title}</p>
                    <p className="mt-1 text-xs text-ink/55">{item.priority.toLowerCase()} - {item.dueAt ? `due ${formatDate(item.dueAt)}` : "no due date"} - {userName(data.users, item.assignedToUserId)} - {workspaceName(data.workspaces, item.assignedWorkspaceId)}</p>
                  </div>
                  <Badge>{item.status.toLowerCase().replaceAll("_", " ")}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-ink/60">{item.prayerPoint}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => void request("PATCH", { entity: "PRAYER_ASSIGNMENT", id: item.id, status: "IN_PROGRESS" }, "Prayer assignment updated.")}>In progress</Button>
                  <Button variant="secondary" onClick={() => void request("PATCH", { entity: "PRAYER_ASSIGNMENT", id: item.id, status: "COMPLETED", completionNotes: "Completed." }, "Prayer assignment completed.")}>Complete</Button>
                  <Button variant="danger" onClick={() => void request("DELETE", { entity: "PRAYER_ASSIGNMENT", id: item.id }, "Prayer assignment deleted.")}><Trash2 className="h-4 w-4" />Delete</Button>
                </div>
              </div>
            ))}
          </RecordList>
        </Panel>

        <Panel title="Church Calendar Intelligence" icon={<CalendarCheck2 className="h-4 w-4" />}>
          <p className="text-sm leading-6 text-ink/60">Detect overlapping meetings, service plans, leaders, resources, workspaces, branches, and ministry activities.</p>
          <Button className="mt-3" disabled={Boolean(busy)} onClick={() => void request("POST", { entity: "CALENDAR_SCAN" }, "Calendar intelligence scan completed.")}>
            <RefreshCw className="h-4 w-4" />
            Scan calendar conflicts
          </Button>
          <RecordList empty="No calendar conflicts found." loading={loading}>
            {data.calendarConflicts.slice(0, 10).map((item) => (
              <div className="rounded-md border border-ink/10 p-3" key={item.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{item.title}</p>
                    <p className="mt-1 text-xs text-ink/55">{item.conflictType.toLowerCase()} - {formatDate(item.startsAt)} to {formatDate(item.endsAt)}</p>
                  </div>
                  <Badge className={item.status === "OPEN" ? "bg-wheat text-ink" : "bg-mint text-moss"}>{item.status.toLowerCase()}</Badge>
                </div>
                <p className="mt-2 text-sm leading-6 text-ink/60">{item.details}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => void request("PATCH", { entity: "CALENDAR_CONFLICT", id: item.id, status: "ACKNOWLEDGED" }, "Conflict acknowledged.")}>Acknowledge</Button>
                  <Button variant="secondary" onClick={() => void request("PATCH", { entity: "CALENDAR_CONFLICT", id: item.id, status: "RESOLVED" }, "Conflict resolved.")}>Resolve</Button>
                  <Button variant="ghost" onClick={() => void request("PATCH", { entity: "CALENDAR_CONFLICT", id: item.id, status: "DISMISSED" }, "Conflict dismissed.")}>Dismiss</Button>
                </div>
              </div>
            ))}
          </RecordList>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel title="External Guest Portal" icon={<UserRoundPlus className="h-4 w-4" />}>
          <div className="grid gap-3 md:grid-cols-2">
            <Input placeholder="Guest name" value={guestForm.name} onChange={(event) => setGuestForm({ ...guestForm, name: event.target.value })} />
            <Input placeholder="Guest email" value={guestForm.email} onChange={(event) => setGuestForm({ ...guestForm, email: event.target.value })} />
            <Input placeholder="Organization" value={guestForm.organization} onChange={(event) => setGuestForm({ ...guestForm, organization: event.target.value })} />
            <Input placeholder="Guest type, e.g. auditor" value={guestForm.guestType} onChange={(event) => setGuestForm({ ...guestForm, guestType: event.target.value })} />
            <Select value={guestForm.workspaceId} onChange={(value) => setGuestForm({ ...guestForm, workspaceId: value })}>
              <option value="">Workspace scope</option>
              {data.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
            </Select>
            <Select value={guestForm.fileId} onChange={(value) => setGuestForm({ ...guestForm, fileId: value })}>
              <option value="">Optional file scope</option>
              {data.files.map((file) => <option key={file.id} value={file.id}>{file.fileName}</option>)}
            </Select>
            <Input type="datetime-local" value={guestForm.expiresAt} onChange={(event) => setGuestForm({ ...guestForm, expiresAt: event.target.value })} />
          </div>
          <Textarea className="mt-3" placeholder="Purpose and exact access boundary" value={guestForm.purpose} onChange={(event) => setGuestForm({ ...guestForm, purpose: event.target.value })} />
          <Button className="mt-3" disabled={Boolean(busy) || !guestForm.name || !guestForm.email || !guestForm.purpose || !guestForm.expiresAt} onClick={() => void createGuest()}>Create secure guest link</Button>
          {guestUrl ? <p className="mt-3 break-all rounded-md bg-mint px-3 py-2 text-xs text-moss">{guestUrl}</p> : null}
          <RecordList empty="No guest links yet." loading={loading}>
            {data.externalGuests.slice(0, 8).map((item) => (
              <div className="rounded-md border border-ink/10 p-3" key={item.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{item.name}</p>
                    <p className="mt-1 text-xs text-ink/55">{item.email} - expires {formatDate(item.expiresAt)}</p>
                  </div>
                  <Badge>{item.status.toLowerCase()}</Badge>
                </div>
                <p className="mt-2 text-sm text-ink/60">{item.purpose}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => setGuestUrl(`${window.location.origin}/guest/${item.token}`)}>Show link</Button>
                  <Button variant="danger" onClick={() => void request("DELETE", { entity: "EXTERNAL_GUEST", id: item.id, mode: "REVOKE" }, "Guest access revoked.")}>Revoke</Button>
                </div>
              </div>
            ))}
          </RecordList>
        </Panel>

        <Panel title="President Delegation Center" icon={<ShieldCheck className="h-4 w-4" />}>
          <div className="grid gap-3 md:grid-cols-2">
            <Select value={delegationForm.delegatedToId} onChange={(value) => setDelegationForm({ ...delegationForm, delegatedToId: value })}>
              <option value="">Select trusted leader</option>
              {data.users.map((user) => <option key={user.id} value={user.id}>{user.name || user.email}</option>)}
            </Select>
            <Input type="datetime-local" value={delegationForm.expiresAt} onChange={(event) => setDelegationForm({ ...delegationForm, expiresAt: event.target.value })} />
          </div>
          <Textarea className="mt-3" placeholder="Reason and boundaries for delegation" value={delegationForm.reason} onChange={(event) => setDelegationForm({ ...delegationForm, reason: event.target.value })} />
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {[
              ["canIssueCertificates", "Issue certificates"],
              ["canIssueIdCards", "Issue ID cards"],
              ["canIssueLetters", "Issue letters"],
              ["canManagePrayerAssignments", "Manage prayer assignments"],
              ["canResolveCalendarConflicts", "Resolve calendar conflicts"],
              ["canManageExternalGuests", "Manage external guests"],
              ["canRunSystemCleanup", "Run cleanup"]
            ].map(([key, label]) => (
              <label className="flex items-center gap-2 rounded-md border border-ink/10 bg-paper px-3 py-2 text-sm" key={key}>
                <input
                  checked={Boolean(delegationForm[key as keyof typeof delegationForm])}
                  onChange={(event) => setDelegationForm({ ...delegationForm, [key]: event.target.checked })}
                  type="checkbox"
                />
                {label}
              </label>
            ))}
          </div>
          <Button className="mt-3" disabled={Boolean(busy) || !delegationForm.delegatedToId || !delegationForm.expiresAt} onClick={() => void createDelegation()}>Grant temporary delegation</Button>
          <RecordList empty="No delegations yet." loading={loading}>
            {data.delegations.slice(0, 8).map((item) => (
              <div className="rounded-md border border-ink/10 p-3" key={item.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{userName(data.users, item.delegatedToId)}</p>
                    <p className="mt-1 text-xs text-ink/55">Expires {formatDate(item.expiresAt)}</p>
                  </div>
                  <Badge>{item.status.toLowerCase()}</Badge>
                </div>
                <p className="mt-2 text-xs text-ink/55">{[
                  item.canIssueCertificates ? "certificates" : "",
                  item.canIssueIdCards ? "ID cards" : "",
                  item.canIssueLetters ? "letters" : "",
                  item.canManagePrayerAssignments ? "prayer" : "",
                  item.canResolveCalendarConflicts ? "calendar" : "",
                  item.canManageExternalGuests ? "guests" : "",
                  item.canRunSystemCleanup ? "cleanup" : ""
                ].filter(Boolean).join(", ") || "No active permissions"}</p>
                <Button className="mt-3" variant="danger" onClick={() => void request("DELETE", { entity: "PRESIDENT_DELEGATION", id: item.id }, "President delegation revoked.")}>Revoke delegation</Button>
              </div>
            ))}
          </RecordList>
        </Panel>
      </section>

      <Panel title="System Cleanup Button" icon={<RefreshCw className="h-4 w-4" />}>
        <p className="text-sm leading-6 text-ink/60">
          This removes stale access safely: expired workspace/file grants, expired share links, expired issuing authority,
          old devices, expired guest links, expired delegation records, and stale pending access requests.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-4">
          {Object.entries(data.cleanupPreview).filter(([key]) => key !== "total").map(([key, value]) => (
            <div className="rounded-md border border-ink/10 bg-paper p-3" key={key}>
              <p className="text-lg font-semibold text-ink">{value}</p>
              <p className="text-xs text-ink/55">{key.replace(/([A-Z])/g, " $1").toLowerCase()}</p>
            </div>
          ))}
        </div>
        <Button className="mt-4" variant="danger" disabled={Boolean(busy)} onClick={() => void request("POST", { entity: "SYSTEM_CLEANUP", confirmation: "CLEAN STALE ACCESS" }, "System cleanup completed.")}>
          Clean stale access now
        </Button>
      </Panel>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
      <p className="text-2xl font-semibold text-ink">{value}</p>
      <p className="text-sm text-ink/55">{label}</p>
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
      <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
        <span className="text-moss">{icon}</span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function RecordList({ children, empty, loading }: { children: ReactNode; empty: string; loading: boolean }) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : Boolean(children);
  return (
    <div className="mt-4 space-y-3">
      {loading ? <p className="flex items-center gap-2 text-sm text-ink/55"><Loader2 className="h-4 w-4 animate-spin" />Loading records</p> : null}
      {!loading && !hasChildren ? <p className="rounded-md bg-paper px-3 py-6 text-sm text-ink/55">{empty}</p> : children}
    </div>
  );
}

function Select({ children, value, onChange }: { children: ReactNode; value: string; onChange: (value: string) => void }) {
  return (
    <select
      className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm text-ink outline-none transition focus:border-moss focus:ring-2 focus:ring-moss/15"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {children}
    </select>
  );
}
