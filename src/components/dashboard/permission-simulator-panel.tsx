"use client";

import { FormEvent, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, Loader2, Search, ShieldCheck, ShieldX, UserRoundSearch } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type SimUser = {
  id: string;
  name?: string | null;
  email?: string | null;
};

type Simulation = {
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
    status: string;
    department?: { name: string; kind: string } | null;
    category?: string | null;
    profile?: { membershipNumber?: string | null; organizationPosition?: string | null; membershipStatus?: string | null } | null;
    sanctions: Array<{ type: string; reason?: string | null; expiresAt?: string | null }>;
  };
  summary: {
    isGlobalAdmin: boolean;
    canCreateWorkspace: boolean;
    accessibleWorkspaces: number;
    blockedWorkspaces: number;
    activeShareLinks: number;
    scopedAiAgents: number;
  };
  organizationLeadership: Array<{
    id: string;
    title: string;
    canCreateWorkspaces: boolean;
    inheritToChildren: boolean;
    unit: { name: string; type: string; code?: string | null };
  }>;
  workspaces: Array<{
    id: string;
    name: string;
    accessible: boolean;
    role?: string | null;
    permissions?: Record<string, boolean> | null;
    reasons: string[];
    counts: { files: number; members: number; chatChannels: number };
  }>;
  shareLinks: Array<{ id: string; fileName: string; workspaceId: string; expiresAt?: string | null }>;
  aiAgents: Array<{ id: string; name: string; workspaceId?: string | null }>;
};

const permissionLabels: Record<string, string> = {
  canUploadFiles: "upload files",
  canDeleteFiles: "delete files",
  canCreateFolders: "create folders",
  canCreateChannels: "create channels",
  canSendMessages: "send chat",
  canManageMembers: "manage members",
  canManageIntegrations: "manage integrations",
  canViewActivity: "view activity",
  canClearActivity: "clear activity",
  canCreateAnnouncements: "create announcements",
  canManageTasks: "manage tasks",
  canScheduleMeetings: "schedule meetings",
  canCreateShareLinks: "create share links"
};

function displayName(user: SimUser) {
  return user.name ?? user.email ?? "LETW member";
}

export function PermissionSimulatorPanel({ users }: { users: SimUser[] }) {
  const [selectedUserId, setSelectedUserId] = useState(users[0]?.id ?? "");
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const filteredUsers = users.filter((user) =>
    [user.name, user.email].filter(Boolean).join(" ").toLowerCase().includes(query.trim().toLowerCase())
  );

  async function run(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!selectedUserId) return;
    setLoading(true);
    setError("");
    const response = await fetch(`/api/admin/permission-simulator?userId=${encodeURIComponent(selectedUserId)}`);
    const body = (await response.json().catch(() => null)) as Simulation & { error?: string };
    setLoading(false);

    if (!response.ok) {
      setError(body?.error ?? "Permission simulation failed.");
      return;
    }

    setSimulation(body);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[24rem_minmax(0,1fr)]">
      <section className="rounded-lg border border-ink/10 bg-white p-4">
        <div className="mb-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <UserRoundSearch className="h-4 w-4 text-moss" />
            Choose member
          </p>
          <p className="mt-1 text-xs leading-5 text-ink/55">Select a member to see exactly what LETW permits or blocks.</p>
        </div>
        <form className="space-y-3" onSubmit={run}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
            <input
              className="h-10 w-full rounded-md border border-ink/10 bg-white pl-9 pr-3 text-sm"
              placeholder="Search name or email"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <select
            className="h-11 w-full rounded-md border border-ink/10 bg-white px-3 text-sm"
            value={selectedUserId}
            onChange={(event) => setSelectedUserId(event.target.value)}
            required
          >
            {filteredUsers.map((user) => (
              <option key={user.id} value={user.id}>
                {displayName(user)} {user.email ? `- ${user.email}` : ""}
              </option>
            ))}
          </select>
          <Button className="w-full" disabled={loading || !selectedUserId} type="submit">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Simulate permissions
          </Button>
        </form>
        {error ? <p className="mt-3 rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
      </section>

      <section className="space-y-5">
        {!simulation ? (
          <div className="rounded-lg border border-ink/10 bg-white p-8 text-sm text-ink/55">
            Choose a member and run the simulator.
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-ink/10 bg-white p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <p className="text-sm font-semibold text-moss">Permission result</p>
                  <h2 className="mt-1 text-2xl font-semibold text-ink">{simulation.user.name ?? simulation.user.email}</h2>
                  <p className="mt-1 text-sm text-ink/55">
                    {simulation.user.profile?.organizationPosition ?? "No LETW position"} -{" "}
                    {simulation.user.profile?.membershipNumber ?? "No member number"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>{simulation.user.status.toLowerCase()}</Badge>
                  {simulation.summary.isGlobalAdmin ? <Badge className="bg-wheat">organization admin</Badge> : null}
                  {simulation.summary.canCreateWorkspace ? <Badge className="bg-mint">can create workspace</Badge> : null}
                </div>
              </div>
              {simulation.user.sanctions.length ? (
                <div className="mt-4 rounded-md border border-clay/20 bg-clay/10 p-3 text-sm text-clay">
                  <p className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4" />
                    Active sanctions
                  </p>
                  <ul className="mt-2 space-y-1">
                    {simulation.user.sanctions.map((sanction) => (
                      <li key={`${sanction.type}-${sanction.reason}`}>{sanction.type.toLowerCase().replaceAll("_", " ")}: {sanction.reason ?? "No reason"}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {[
                ["Accessible", simulation.summary.accessibleWorkspaces],
                ["Blocked", simulation.summary.blockedWorkspaces],
                ["Share links", simulation.summary.activeShareLinks],
                ["AI agents", simulation.summary.scopedAiAgents],
                ["Leadership scopes", simulation.organizationLeadership.length]
              ].map(([label, value]) => (
                <div className="rounded-lg border border-ink/10 bg-white p-4" key={label}>
                  <p className="text-2xl font-semibold text-ink">{value}</p>
                  <p className="text-sm text-ink/55">{label}</p>
                </div>
              ))}
            </div>

            {simulation.organizationLeadership.length ? (
              <div className="rounded-lg border border-ink/10 bg-white p-4">
                <p className="text-sm font-semibold text-ink">Organization leadership scope</p>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {simulation.organizationLeadership.map((leader) => (
                    <div className="rounded-md bg-paper p-3 text-sm" key={leader.id}>
                      <p className="font-semibold text-ink">{leader.title}</p>
                      <p className="mt-1 text-xs text-ink/55">
                        {leader.unit.type.toLowerCase()}: {leader.unit.name} {leader.unit.code ? `- ${leader.unit.code}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="rounded-lg border border-ink/10 bg-white">
              <div className="border-b border-ink/10 px-4 py-3">
                <p className="text-sm font-semibold text-ink">Workspace-by-workspace access</p>
              </div>
              <div className="divide-y divide-ink/10">
                {simulation.workspaces.map((workspace) => (
                  <div className="p-4" key={workspace.id}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="flex items-center gap-2 font-semibold text-ink">
                          {workspace.accessible ? <CheckCircle2 className="h-4 w-4 text-moss" /> : <ShieldX className="h-4 w-4 text-clay" />}
                          {workspace.name}
                        </p>
                        <p className="mt-1 text-xs text-ink/50">
                          {workspace.counts.members} members - {workspace.counts.files} files - {workspace.counts.chatChannels} channels
                        </p>
                      </div>
                      <Badge className={workspace.accessible ? "bg-mint" : "bg-clay/10 text-clay"}>
                        {workspace.accessible ? workspace.role?.toLowerCase() ?? "allowed" : "blocked"}
                      </Badge>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {workspace.permissions
                        ? Object.entries(workspace.permissions)
                            .filter(([, enabled]) => enabled)
                            .map(([key]) => <Badge className="bg-paper" key={key}>{permissionLabels[key] ?? key}</Badge>)
                        : null}
                    </div>
                    <ul className="mt-3 space-y-1 text-xs text-ink/55">
                      {workspace.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-5 xl:grid-cols-2">
              <div className="rounded-lg border border-ink/10 bg-white p-4">
                <p className="text-sm font-semibold text-ink">Live share links created by this member</p>
                <div className="mt-3 space-y-2">
                  {simulation.shareLinks.length === 0 ? <p className="text-sm text-ink/55">No live share links.</p> : null}
                  {simulation.shareLinks.map((link) => <p className="rounded-md bg-paper p-2 text-sm" key={link.id}>{link.fileName}</p>)}
                </div>
              </div>
              <div className="rounded-lg border border-ink/10 bg-white p-4">
                <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <Bot className="h-4 w-4 text-moss" />
                  Enabled AI agents
                </p>
                <div className="mt-3 space-y-2">
                  {simulation.aiAgents.length === 0 ? <p className="text-sm text-ink/55">No enabled AI agents.</p> : null}
                  {simulation.aiAgents.map((agent) => <p className="rounded-md bg-paper p-2 text-sm" key={agent.id}>{agent.name}</p>)}
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
