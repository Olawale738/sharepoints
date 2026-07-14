"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Crown, FileLock2, Loader2, LockKeyhole, ShieldAlert, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";

type Policy = {
  active: boolean;
  requireOfficialLetters: boolean;
  requireCertificates: boolean;
  requireIdCards: boolean;
  requireLeadershipAppointments: boolean;
  requireSensitiveFiles: boolean;
  requireFinancialApprovals: boolean;
};

type Lockdown = {
  active: boolean;
  lockDownloads: boolean;
  lockNewLogins: boolean;
  freezeDocumentChanges: boolean;
  disableOfficialIssuing: boolean;
  lockWorkspaceActions: boolean;
  lockFinancialActions: boolean;
  reason?: string | null;
  activatedAt?: string | null;
  deactivatedAt?: string | null;
};

type ApprovalItem = {
  id: string;
  targetType: string;
  title: string;
  summary: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reason?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
};

type WorkspaceLockRow = {
  id: string;
  name: string;
  lockedAt?: string | null;
  lockReason?: string | null;
};

type WallData = {
  policy: Policy;
  lockdown: Lockdown;
  approvals: ApprovalItem[];
  workspaces: WorkspaceLockRow[];
  stats: Record<string, number>;
};

const emptyData: WallData = {
  policy: {
    active: true,
    requireOfficialLetters: true,
    requireCertificates: true,
    requireIdCards: true,
    requireLeadershipAppointments: true,
    requireSensitiveFiles: true,
    requireFinancialApprovals: true
  },
  lockdown: {
    active: false,
    lockDownloads: false,
    lockNewLogins: false,
    freezeDocumentChanges: false,
    disableOfficialIssuing: false,
    lockWorkspaceActions: false,
    lockFinancialActions: false,
    reason: null
  },
  approvals: [],
  workspaces: [],
  stats: {}
};

const statusClass = {
  PENDING: "bg-wheat text-ink",
  APPROVED: "bg-mint text-moss",
  REJECTED: "bg-clay/10 text-clay"
} satisfies Record<ApprovalItem["status"], string>;

function targetLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

export function PresidentWallPanel() {
  const [data, setData] = useState<WallData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<ApprovalItem["status"] | "ALL">("PENDING");
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [lockdownReason, setLockdownReason] = useState("");
  const [workspaceId, setWorkspaceId] = useState("");
  const [workspaceLockReason, setWorkspaceLockReason] = useState("");

  const visibleApprovals = useMemo(
    () => (filter === "ALL" ? data.approvals : data.approvals.filter((approval) => approval.status === filter)),
    [data.approvals, filter]
  );

  async function load() {
    setLoading(true);
    const response = await fetch("/api/admin/president-wall");
    const body = (await response.json().catch(() => null)) as (WallData & { error?: string }) | null;
    setLoading(false);
    if (!response.ok || !body) {
      setError(body?.error ?? "President Approval Wall could not be loaded.");
      return;
    }
    setData(body);
    setLockdownReason(body.lockdown.reason ?? "");
    setWorkspaceId((current) => current || body.workspaces[0]?.id || "");
  }

  useEffect(() => {
    void load();
  }, []);

  async function patch(entity: "POLICY" | "LOCKDOWN" | "WORKSPACE_LOCK", payload: Record<string, unknown>, message: string) {
    setBusy(`${entity}-${Object.keys(payload).join("-")}`);
    setNotice("");
    setError("");
    const response = await fetch("/api/admin/president-wall", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity, ...payload })
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(body?.error ?? "President control update failed.");
      return;
    }
    setNotice(message);
    await load();
  }

  async function decide(id: string, status: "APPROVED" | "REJECTED") {
    setBusy(`${id}-${status}`);
    setNotice("");
    setError("");
    const response = await fetch("/api/admin/president-wall", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status, reason: reasonById[id] ?? "" })
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(body?.error ?? "President decision failed.");
      return;
    }
    setNotice(`Request ${status.toLowerCase()}.`);
    await load();
  }

  const policyItems = [
    ["requireOfficialLetters", "Official letters", "letters, revokes, archive/delete"],
    ["requireCertificates", "Certificates", "issue, revoke, restore, delete"],
    ["requireIdCards", "ID cards", "issue, reissue, renew, rotate QR"],
    ["requireLeadershipAppointments", "Leadership appointments", "workspace and network leaders"],
    ["requireSensitiveFiles", "Sensitive files", "DLP, safeguarding, finance, board, legal"],
    ["requireFinancialApprovals", "Financial approvals", "giving receipts and finance records"]
  ] as const;

  const lockdownItems = [
    ["lockDownloads", "Lock downloads", "Blocks file downloads"],
    ["lockNewLogins", "Stop new logins", "Non-president users cannot start a new session"],
    ["freezeDocumentChanges", "Freeze document changes", "Blocks uploads, edits, versions, delete, classification"],
    ["disableOfficialIssuing", "Disable official issuing", "Blocks certificates, ID cards, and letters"],
    ["lockWorkspaceActions", "Lock workspace actions", "Blocks workspace create/delete and role appointments"],
    ["lockFinancialActions", "Lock financial actions", "Blocks giving receipts and finance actions"]
  ] as const;

  return (
    <div className="space-y-6">
      {notice ? <p className="rounded-md border border-moss/15 bg-mint px-4 py-3 text-sm text-moss">{notice}</p> : null}
      {error ? <p className="rounded-md bg-clay/10 px-4 py-3 text-sm text-clay">{error}</p> : null}

      <section className="grid gap-4 md:grid-cols-4">
        <Metric icon={<Crown className="h-5 w-5" />} label="Pending president approvals" value={data.stats.pending ?? 0} />
        <Metric icon={<CheckCircle2 className="h-5 w-5" />} label="Approved" value={data.stats.approved ?? 0} />
        <Metric icon={<XCircle className="h-5 w-5" />} label="Rejected" value={data.stats.rejected ?? 0} />
        <Metric icon={<LockKeyhole className="h-5 w-5" />} label="Lockdown active" value={data.lockdown.active ? 1 : 0} />
        <Metric icon={<FileLock2 className="h-5 w-5" />} label="Locked workspaces" value={data.stats.lockedWorkspaces ?? 0} />
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-moss"><ShieldAlert className="h-4 w-4" />President Approval Wall</p>
              <h2 className="mt-2 text-xl font-semibold text-ink">Sensitive action approval policy</h2>
              <p className="mt-1 text-sm leading-6 text-ink/55">When enabled, delegated leaders submit these actions to the president before they take effect.</p>
            </div>
            <Button
              variant={data.policy.active ? "danger" : "secondary"}
              disabled={Boolean(busy)}
              onClick={() => void patch("POLICY", { active: !data.policy.active }, data.policy.active ? "Approval wall disabled." : "Approval wall enabled.")}
            >
              {data.policy.active ? "Disable wall" : "Enable wall"}
            </Button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {policyItems.map(([key, label, detail]) => (
              <button
                className={`rounded-lg border p-4 text-left transition ${data.policy[key] ? "border-moss/30 bg-mint/70" : "border-ink/10 bg-paper"}`}
                key={key}
                type="button"
                onClick={() => void patch("POLICY", { [key]: !data.policy[key] }, `${label} policy updated.`)}
              >
                <p className="text-sm font-semibold text-ink">{label}</p>
                <p className="mt-1 text-xs leading-5 text-ink/55">{detail}</p>
                <Badge className={data.policy[key] ? "mt-3 bg-white text-moss" : "mt-3 bg-white text-ink"}>{data.policy[key] ? "president required" : "not required"}</Badge>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-clay"><AlertTriangle className="h-4 w-4" />Emergency Lockdown</p>
              <h2 className="mt-2 text-xl font-semibold text-ink">Immediate override controls</h2>
              <p className="mt-1 text-sm leading-6 text-ink/55">President can freeze dangerous actions instantly. The president can still enter and repair the system.</p>
            </div>
            <Button
              variant={data.lockdown.active ? "danger" : "secondary"}
              disabled={Boolean(busy)}
              onClick={() => void patch("LOCKDOWN", { active: !data.lockdown.active, reason: lockdownReason || null }, data.lockdown.active ? "Emergency lockdown deactivated." : "Emergency lockdown activated.")}
            >
              {data.lockdown.active ? "Deactivate" : "Activate"}
            </Button>
          </div>
          <Textarea className="mt-4" placeholder="Lockdown reason shown to blocked users" value={lockdownReason} onChange={(event) => setLockdownReason(event.target.value)} />
          <Button className="mt-3" variant="secondary" onClick={() => void patch("LOCKDOWN", { reason: lockdownReason || null }, "Lockdown reason saved.")}>Save reason</Button>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {lockdownItems.map(([key, label, detail]) => (
              <button
                className={`rounded-lg border p-4 text-left transition ${data.lockdown[key] ? "border-clay/30 bg-clay/10" : "border-ink/10 bg-paper"}`}
                key={key}
                type="button"
                onClick={() => void patch("LOCKDOWN", { [key]: !data.lockdown[key] }, `${label} updated.`)}
              >
                <p className="text-sm font-semibold text-ink">{label}</p>
                <p className="mt-1 text-xs leading-5 text-ink/55">{detail}</p>
                <Badge className={data.lockdown[key] ? "mt-3 bg-white text-clay" : "mt-3 bg-white text-ink"}>{data.lockdown[key] ? "locked" : "open"}</Badge>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-moss"><LockKeyhole className="h-4 w-4" />Workspace Lock</p>
            <h2 className="mt-2 text-xl font-semibold text-ink">Lock one workspace</h2>
            <p className="mt-1 text-sm leading-6 text-ink/55">
              President-only override for a single workspace. Non-president users are blocked from files, chat, meetings, tasks, forms, and actions until it is unlocked.
            </p>
          </div>
          <label className="mt-4 block text-xs font-semibold uppercase text-ink/55" htmlFor="workspace-lock-select">Workspace</label>
          <select
            className="mt-2 h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm text-ink outline-none focus:border-moss"
            id="workspace-lock-select"
            value={workspaceId}
            onChange={(event) => setWorkspaceId(event.target.value)}
          >
            {data.workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>
                {workspace.lockedAt ? "Locked - " : ""}{workspace.name}
              </option>
            ))}
          </select>
          <Textarea
            className="mt-3"
            placeholder="Reason shown to blocked users"
            value={workspaceLockReason}
            onChange={(event) => setWorkspaceLockReason(event.target.value)}
          />
          {workspaceId ? (
            <div className="mt-3 rounded-md bg-paper px-3 py-2 text-xs text-ink/60">
              {data.workspaces.find((workspace) => workspace.id === workspaceId)?.lockedAt
                ? `Currently locked: ${data.workspaces.find((workspace) => workspace.id === workspaceId)?.lockReason ?? "No reason recorded."}`
                : "Currently open."}
            </div>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              variant="danger"
              disabled={!workspaceId || Boolean(busy)}
              onClick={() => void patch("WORKSPACE_LOCK", { workspaceId, locked: true, reason: workspaceLockReason || null }, "Workspace locked.")}
            >
              Lock workspace
            </Button>
            <Button
              variant="secondary"
              disabled={!workspaceId || Boolean(busy)}
              onClick={() => void patch("WORKSPACE_LOCK", { workspaceId, locked: false }, "Workspace unlocked.")}
            >
              Unlock workspace
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-ink/10 bg-white shadow-soft">
        <div className="flex flex-col gap-3 border-b border-ink/10 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-ink"><FileLock2 className="h-4 w-4 text-moss" />President approval queue</p>
            <p className="mt-1 text-xs text-ink/55">Official letters, certificates, ID cards, leadership appointments, sensitive files, and financial approvals.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {(["PENDING", "APPROVED", "REJECTED"] as const).map((status) => (
              <button className={`rounded-full border px-2.5 py-1 text-xs font-medium ${filter === status ? "border-moss bg-mint" : "border-ink/10 bg-white"}`} key={status} onClick={() => setFilter(status)} type="button">
                {status.toLowerCase()} {data.approvals.filter((item) => item.status === status).length}
              </button>
            ))}
            <button className={`rounded-full border px-2.5 py-1 text-xs font-medium ${filter === "ALL" ? "border-moss bg-mint" : "border-ink/10 bg-white"}`} onClick={() => setFilter("ALL")} type="button">all {data.approvals.length}</button>
          </div>
        </div>
        <div className="divide-y divide-ink/10">
          {loading ? <p className="flex items-center gap-2 p-5 text-sm text-ink/55"><Loader2 className="h-4 w-4 animate-spin" />Loading president queue</p> : null}
          {!loading && !visibleApprovals.length ? <p className="p-5 text-sm text-ink/55">No requests in this view.</p> : null}
          {visibleApprovals.map((item) => (
            <article className="p-5" key={item.id}>
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={statusClass[item.status]}>{item.status.toLowerCase()}</Badge>
                    <span className="text-xs font-semibold uppercase text-moss">{targetLabel(item.targetType)}</span>
                  </div>
                  <h3 className="mt-2 font-semibold text-ink">{item.title}</h3>
                  <p className="mt-1 max-w-4xl text-sm leading-6 text-ink/60">{item.summary}</p>
                  <p className="mt-2 text-xs text-ink/45">Requested {formatDate(item.createdAt)}{item.reviewedAt ? ` - reviewed ${formatDate(item.reviewedAt)}` : ""}</p>
                  {item.reason ? <p className="mt-2 rounded-md bg-paper px-3 py-2 text-xs text-ink/60">{item.reason}</p> : null}
                </div>
                {item.status === "PENDING" ? (
                  <div className="flex min-w-64 flex-col gap-2">
                    <Input className="bg-white text-xs" placeholder="Reason if rejecting" value={reasonById[item.id] ?? ""} onChange={(event) => setReasonById((current) => ({ ...current, [item.id]: event.target.value }))} />
                    <div className="flex gap-2">
                      <Button disabled={busy === `${item.id}-APPROVED`} onClick={() => void decide(item.id, "APPROVED")}>
                        {busy === `${item.id}-APPROVED` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Approve
                      </Button>
                      <Button variant="secondary" disabled={busy === `${item.id}-REJECTED`} onClick={() => void decide(item.id, "REJECTED")}>
                        <XCircle className="h-4 w-4" />
                        Reject
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
      <div className="text-moss">{icon}</div>
      <p className="mt-3 text-2xl font-semibold text-ink">{value}</p>
      <p className="text-sm text-ink/55">{label}</p>
    </div>
  );
}
