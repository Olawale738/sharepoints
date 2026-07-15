"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArchiveRestore,
  BellRing,
  DatabaseBackup,
  FileClock,
  FileSearch,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Workflow
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatBytes, formatDate } from "@/lib/utils";

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | string;

type CommandCenterData = {
  generatedAt: string;
  metrics: {
    urgentItems: number;
    failedNotifications: number;
    weakBranches: number;
    pendingSignatures: number;
    failedBackups: number;
    securityAlerts: number;
    documentIssues: number;
    workspaces: number;
  };
  urgentItems: Array<{ title: string; count: number; severity: Severity; href: string }>;
  failedNotifications: Array<{ id: string; channel: string; status: string; error: string; userName: string; createdAt: string }>;
  weakBranches: Array<{ id: string; name: string; type: string; countryCode: string | null; leaders: number; members: number }>;
  pendingSignatures: Array<{ id: string; title: string; signerName: string; targetType: string; createdAt: string }>;
  backupStatus: { latestBackupAt: string | null; latestBackupName: string | null; latestBackupSize: number; failedBackups: number };
  security: { failedLogins: number; accessDenials: number; openDlpIncidents: number; lockdownActive: boolean; lockdownReason: string | null };
  permissionReview: {
    summary: { oldUnusedMemberships: number; transferredLeaders: number; expiringAccess: number; highRisk: number; inactiveCutoff: string };
    oldUnusedMemberships: Array<{ id: string; severity: string; title: string; detail: string; href: string }>;
    transferredLeaderSuggestions: Array<{ id: string; severity: string; title: string; detail: string; href: string }>;
    expiringAccessSuggestions: Array<{ id: string; severity: string; title: string; detail: string; href: string }>;
  };
  documentLifecycle: {
    draftOrUnderReview: number;
    approvedActive: number;
    expired: number;
    archived: number;
    legalHold: number;
    infected: number;
    dueItems: Array<{ id: string; title: string; targetType: string; status: string; reviewDueAt: string | null; expiresAt: string | null }>;
  };
  presidentRules: {
    active: boolean;
    requireOfficialLetters: boolean;
    requireCertificates: boolean;
    requireIdCards: boolean;
    requireLeadershipAppointments: boolean;
    requireSensitiveFiles: boolean;
    requireFinancialApprovals: boolean;
    pendingPresidentApprovals: number;
    lockdownActive: boolean;
  };
  collaboration: {
    onlyOfficeConfigured: boolean;
    realtimeConfigured: boolean;
    editableFiles: number;
    checkedOutFiles: number;
    staleCheckouts: Array<{ id: string; fileName: string; checkedOutAt: string | null }>;
  };
};

type SearchResult = {
  type: string;
  id: string;
  title: string;
  status?: string | number | null;
  detail?: string | number | null;
  date?: string | null;
  member?: string | null;
  workspace?: string | null;
  certificateNumber?: string | null;
  month?: number;
  year?: number;
};

type SearchData = {
  answer: string;
  results: SearchResult[];
  generatedAt: string;
};

type CommandAction = "SYNC_DOCUMENT_LIFECYCLE" | "CLEANUP_EXPIRED_ACCESS";

const actionLabels: Record<CommandAction, string> = {
  SYNC_DOCUMENT_LIFECYCLE: "Sync document lifecycle",
  CLEANUP_EXPIRED_ACCESS: "Clean expired access"
};

function severityClass(severity: Severity) {
  if (severity === "CRITICAL") return "bg-clay text-white";
  if (severity === "HIGH") return "bg-clay/10 text-clay";
  if (severity === "MEDIUM") return "bg-wheat text-ink";
  return "bg-mint text-ink";
}

function metricCards(data: CommandCenterData) {
  return [
    { label: "Urgent approvals", value: data.metrics.urgentItems, icon: ShieldAlert },
    { label: "Failed notifications", value: data.metrics.failedNotifications, icon: BellRing },
    { label: "Weak branches", value: data.metrics.weakBranches, icon: UsersRound },
    { label: "Pending signatures", value: data.metrics.pendingSignatures, icon: Workflow },
    { label: "Security alerts", value: data.metrics.securityAlerts, icon: LockKeyhole },
    { label: "Document issues", value: data.metrics.documentIssues, icon: FileClock }
  ];
}

function resultDetail(result: SearchResult) {
  return [result.status, result.detail, result.member, result.workspace, result.certificateNumber, result.date, result.month && result.year ? `${result.month}/${result.year}` : null]
    .filter(Boolean)
    .join(" - ");
}

export function UnifiedCommandCenterPanel() {
  const [data, setData] = useState<CommandCenterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [runningAction, setRunningAction] = useState<CommandAction | null>(null);
  const [query, setQuery] = useState("Show all pending Lagos reports.");
  const [searching, setSearching] = useState(false);
  const [searchData, setSearchData] = useState<SearchData | null>(null);

  const loadData = useCallback(async () => {
    setError("");
    setLoading(true);
    const response = await fetch("/api/admin/command-center", { cache: "no-store" });
    const body = (await response.json().catch(() => null)) as CommandCenterData | { error?: string } | null;
    setLoading(false);

    if (!response.ok || !body || "error" in body) {
      setError((body as { error?: string } | null)?.error ?? "Could not load the command center.");
      return;
    }

    setData(body as CommandCenterData);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const permissionSuggestions = useMemo(() => {
    if (!data) return [];
    return [
      ...data.permissionReview.oldUnusedMemberships,
      ...data.permissionReview.transferredLeaderSuggestions,
      ...data.permissionReview.expiringAccessSuggestions
    ].slice(0, 8);
  }, [data]);

  async function runAction(action: CommandAction) {
    setError("");
    setMessage("");
    setRunningAction(action);
    const response = await fetch("/api/admin/command-center", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action })
    });
    const body = (await response.json().catch(() => null)) as { error?: string; result?: Record<string, number> } | null;
    setRunningAction(null);

    if (!response.ok || body?.error) {
      setError(body?.error ?? `${actionLabels[action]} failed.`);
      return;
    }

    const details = body?.result ? Object.entries(body.result).map(([key, value]) => `${key}: ${value}`).join(", ") : "completed";
    setMessage(`${actionLabels[action]} completed. ${details}.`);
    await loadData();
  }

  async function runSearch() {
    setError("");
    setSearchData(null);
    setSearching(true);
    const response = await fetch("/api/admin/search-intelligence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query })
    });
    const body = (await response.json().catch(() => null)) as SearchData | { error?: string } | null;
    setSearching(false);

    if (!response.ok || !body || "error" in body) {
      setError((body as { error?: string } | null)?.error ?? "Search intelligence failed.");
      return;
    }

    setSearchData(body as SearchData);
  }

  if (loading && !data) {
    return (
      <section className="rounded-lg border border-ink/10 bg-white p-8 text-center shadow-soft">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-moss" />
        <p className="mt-3 text-sm text-ink/55">Opening the LETW operating command center...</p>
      </section>
    );
  }

  if (!data) {
    return <div className="rounded-lg border border-clay/20 bg-clay/10 px-4 py-3 text-sm text-clay">{error || "Command center unavailable."}</div>;
  }

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-lg border border-clay/20 bg-clay/10 px-4 py-3 text-sm text-clay">{error}</div> : null}
      {message ? <div className="rounded-lg border border-moss/20 bg-mint px-4 py-3 text-sm text-ink">{message}</div> : null}

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {metricCards(data).map((item) => {
          const Icon = item.icon;
          return (
            <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft" key={item.label}>
              <div className="flex items-center justify-between">
                <Icon className="h-5 w-5 text-moss" />
                <Badge className={item.value ? "bg-wheat text-ink" : "bg-mint text-ink"}>{item.value ? "review" : "clear"}</Badge>
              </div>
              <p className="mt-4 text-3xl font-semibold text-ink">{item.value}</p>
              <p className="mt-1 text-sm text-ink/55">{item.label}</p>
            </div>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-moss">
                  <Sparkles className="h-4 w-4" />
                  Search Intelligence
                </p>
                <h2 className="mt-2 text-2xl font-semibold text-ink">Ask the admin operating database</h2>
                <p className="mt-2 text-sm leading-6 text-ink/60">
                  Search pending reports, expired documents, missing required forms, permission risks, approvals, delivery failures, and lifecycle issues.
                </p>
              </div>
              <Button variant="secondary" onClick={loadData} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </Button>
            </div>
            <div className="mt-5 flex flex-col gap-3 md:flex-row">
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ask: who has not submitted required forms?" />
              <Button className="md:w-36" onClick={runSearch} disabled={searching || query.trim().length < 3}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Ask
              </Button>
            </div>
            {searchData ? (
              <div className="mt-5 rounded-lg border border-ink/10 bg-paper p-4">
                <p className="text-sm font-semibold text-ink">{searchData.answer}</p>
                <div className="mt-3 grid gap-2">
                  {searchData.results.length ? (
                    searchData.results.slice(0, 12).map((result) => (
                      <div className="rounded-md border border-ink/10 bg-white px-3 py-2" key={`${result.type}-${result.id}`}>
                        <p className="text-sm font-medium text-ink">{result.title}</p>
                        <p className="mt-1 text-xs text-ink/55">
                          {result.type}
                          {resultDetail(result) ? ` - ${resultDetail(result)}` : ""}
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-ink/55">No matching records found.</p>
                  )}
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-ink">Urgent command desk</h3>
                  <p className="mt-1 text-xs text-ink/55">Approvals, failed delivery, backups, and signatures that need action.</p>
                </div>
                <ShieldAlert className="h-5 w-5 text-moss" />
              </div>
              <div className="mt-4 space-y-2">
                {data.urgentItems.length ? (
                  data.urgentItems.map((item) => (
                    <Link className="block rounded-md border border-ink/10 bg-paper px-3 py-2 hover:bg-mint/50" href={item.href} key={item.title}>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium text-ink">{item.title}</p>
                        <Badge className={severityClass(item.severity)}>{item.count}</Badge>
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="rounded-md border border-moss/15 bg-mint px-3 py-2 text-sm text-ink">No urgent command items.</p>
                )}
              </div>
            </section>

            <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-sm font-semibold text-ink">Backup and recovery posture</h3>
                  <p className="mt-1 text-xs text-ink/55">Latest organization backup and failed backup count.</p>
                </div>
                <DatabaseBackup className="h-5 w-5 text-moss" />
              </div>
              <div className="mt-4 rounded-md border border-ink/10 bg-paper p-3">
                <p className="text-sm font-medium text-ink">{data.backupStatus.latestBackupName ?? "No completed platform backup yet"}</p>
                <p className="mt-1 text-xs text-ink/55">
                  {data.backupStatus.latestBackupAt ? formatDate(data.backupStatus.latestBackupAt) : "Create a backup from platform excellence."}
                  {data.backupStatus.latestBackupSize ? ` - ${formatBytes(data.backupStatus.latestBackupSize)}` : ""}
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link className="inline-flex h-9 items-center gap-2 rounded-md border border-ink/10 bg-white px-3 text-sm font-medium text-ink hover:bg-paper" href="/dashboard/admin/recovery-center">
                  <ArchiveRestore className="h-4 w-4" />
                  Recovery center
                </Link>
                <Link className="inline-flex h-9 items-center gap-2 rounded-md border border-ink/10 bg-white px-3 text-sm font-medium text-ink hover:bg-paper" href="/dashboard/admin/platform-excellence">
                  <DatabaseBackup className="h-4 w-4" />
                  Backup monitor
                </Link>
              </div>
            </section>
          </div>

          <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-ink">Document lifecycle engine</h3>
                <p className="mt-1 text-xs leading-5 text-ink/55">
                  Draft, review, active, expired, archived, and legal-hold posture for files and official records.
                </p>
              </div>
              <Button variant="secondary" onClick={() => runAction("SYNC_DOCUMENT_LIFECYCLE")} disabled={Boolean(runningAction)}>
                {runningAction === "SYNC_DOCUMENT_LIFECYCLE" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileClock className="h-4 w-4" />}
                Sync lifecycle
              </Button>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
              {[
                ["Draft/review", data.documentLifecycle.draftOrUnderReview],
                ["Active", data.documentLifecycle.approvedActive],
                ["Expired", data.documentLifecycle.expired],
                ["Archived", data.documentLifecycle.archived],
                ["Legal hold", data.documentLifecycle.legalHold],
                ["Infected", data.documentLifecycle.infected]
              ].map(([label, value]) => (
                <div className="rounded-md border border-ink/10 bg-paper p-3" key={label}>
                  <p className="text-2xl font-semibold text-ink">{value}</p>
                  <p className="text-xs text-ink/55">{label}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 space-y-2">
              {data.documentLifecycle.dueItems.slice(0, 8).map((item) => (
                <div className="rounded-md border border-ink/10 bg-white px-3 py-2" key={item.id}>
                  <p className="text-sm font-medium text-ink">{item.title}</p>
                  <p className="mt-1 text-xs text-ink/55">
                    {item.targetType} - {item.status} - {item.expiresAt ?? item.reviewDueAt ?? "no date"}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <ShieldCheck className="h-4 w-4 text-moss" />
              President approval rules
            </h3>
            <div className="mt-3 space-y-2 text-sm">
              {Object.entries({
                "Official letters": data.presidentRules.requireOfficialLetters,
                Certificates: data.presidentRules.requireCertificates,
                "ID cards": data.presidentRules.requireIdCards,
                "Leadership appointments": data.presidentRules.requireLeadershipAppointments,
                "Sensitive files": data.presidentRules.requireSensitiveFiles,
                "Financial approvals": data.presidentRules.requireFinancialApprovals
              }).map(([label, enabled]) => (
                <div className="flex items-center justify-between gap-3" key={label}>
                  <span className="text-ink/60">{label}</span>
                  <Badge className={enabled ? "bg-mint text-ink" : "bg-paper text-ink"}>{enabled ? "required" : "off"}</Badge>
                </div>
              ))}
            </div>
            <Link className="mt-4 inline-flex h-9 items-center gap-2 rounded-md border border-ink/10 bg-paper px-3 text-sm font-medium text-ink hover:bg-mint/50" href="/dashboard/admin/president-wall">
              Manage rules
            </Link>
          </section>

          <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-ink">Smart permission review</h3>
              <Button className="h-9 px-3" variant="secondary" onClick={() => runAction("CLEANUP_EXPIRED_ACCESS")} disabled={Boolean(runningAction)}>
                {runningAction === "CLEANUP_EXPIRED_ACCESS" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              </Button>
            </div>
            <p className="mt-1 text-xs text-ink/55">Expired grants, old access, transferred leaders, and non-expiring share links.</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-md bg-paper p-3">
                <p className="text-xl font-semibold text-ink">{data.permissionReview.summary.highRisk}</p>
                <p className="text-xs text-ink/55">high risk</p>
              </div>
              <div className="rounded-md bg-paper p-3">
                <p className="text-xl font-semibold text-ink">{data.permissionReview.summary.expiringAccess}</p>
                <p className="text-xs text-ink/55">expiring</p>
              </div>
            </div>
            <div className="mt-3 space-y-2">
              {permissionSuggestions.length ? (
                permissionSuggestions.map((item) => (
                  <Link className="block rounded-md border border-ink/10 bg-white px-3 py-2 hover:bg-paper" href={item.href} key={item.id}>
                    <p className="text-xs font-semibold text-ink">{item.title}</p>
                    <p className="mt-1 text-xs leading-5 text-ink/55">{item.detail}</p>
                  </Link>
                ))
              ) : (
                <p className="rounded-md border border-moss/15 bg-mint px-3 py-2 text-xs text-ink">No permission review warnings.</p>
              )}
            </div>
          </section>

          <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <FileSearch className="h-4 w-4 text-moss" />
              Live document collaboration
            </h3>
            <div className="mt-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink/60">OnlyOffice</span>
                <Badge className={data.collaboration.onlyOfficeConfigured ? "bg-mint text-ink" : "bg-wheat text-ink"}>
                  {data.collaboration.onlyOfficeConfigured ? "ready" : "setup needed"}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink/60">Realtime</span>
                <Badge className={data.collaboration.realtimeConfigured ? "bg-mint text-ink" : "bg-wheat text-ink"}>
                  {data.collaboration.realtimeConfigured ? "ready" : "setup needed"}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink/60">Editable files</span>
                <span className="font-medium text-ink">{data.collaboration.editableFiles}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-ink/60">Checked out</span>
                <span className="font-medium text-ink">{data.collaboration.checkedOutFiles}</span>
              </div>
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
