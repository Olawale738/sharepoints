"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  DatabaseBackup,
  FileCheck2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Stethoscope,
  Wrench
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils";

type ReadinessCheck = {
  area: string;
  label: string;
  status: "READY" | "WARNING" | "CRITICAL";
  detail: string;
};

type AreaScore = {
  area: string;
  score: number;
  warnings: number;
};

type PlatformSnapshot = {
  overallScore: number;
  byArea: AreaScore[];
  checks: ReadinessCheck[];
  monitor: {
    status: string;
    warnings: string[];
    checkedAt: string;
    metrics: Record<string, number | string | null>;
  };
  metrics: Record<string, number | string | null>;
  generatedAt: string;
};

type ActionKey = "RUN_MONITOR" | "CREATE_BACKUP" | "VERIFY_BACKUPS" | "RELEASE_STALE_CHECKOUTS";

const actionLabels: Record<ActionKey, string> = {
  RUN_MONITOR: "Run monitor",
  CREATE_BACKUP: "Create backup",
  VERIFY_BACKUPS: "Verify backups",
  RELEASE_STALE_CHECKOUTS: "Release stale locks"
};

const areaIcons: Record<string, typeof ShieldCheck> = {
  Reliability: Stethoscope,
  Backups: DatabaseBackup,
  Documents: FileCheck2,
  Mobile: Smartphone,
  Search: Sparkles,
  Security: ShieldCheck
};

function scoreClass(score: number) {
  if (score >= 85) return "text-moss";
  if (score >= 60) return "text-amber-700";
  return "text-clay";
}

function statusClass(status: ReadinessCheck["status"]) {
  if (status === "READY") return "bg-mint text-ink";
  if (status === "WARNING") return "bg-wheat text-ink";
  return "bg-clay text-white";
}

function stringifyResult(value: unknown) {
  if (typeof value === "number") return `${value}`;
  if (Array.isArray(value)) return `${value.length} record(s) checked.`;
  if (value && typeof value === "object" && "result" in value) return stringifyResult((value as { result: unknown }).result);
  return "Action completed.";
}

export function PlatformExcellencePanel() {
  const [snapshot, setSnapshot] = useState<PlatformSnapshot | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [runningAction, setRunningAction] = useState<ActionKey | null>(null);

  const loadSnapshot = useCallback(async () => {
    setError("");
    setLoading(true);
    const response = await fetch("/api/admin/platform-excellence", { cache: "no-store" });
    const data = (await response.json().catch(() => null)) as PlatformSnapshot | { error?: string } | null;
    setLoading(false);

    const responseError = data && "error" in data ? data.error : undefined;
    if (!response.ok || !data || responseError !== undefined) {
      setError((data as { error?: string } | null)?.error ?? "Platform audit failed.");
      return;
    }

    setSnapshot(data as PlatformSnapshot);
  }, []);

  async function runAction(action: ActionKey) {
    setMessage("");
    setError("");
    setRunningAction(action);
    const response = await fetch("/api/admin/platform-excellence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action })
    });
    const data = (await response.json().catch(() => null)) as { error?: string; result?: unknown } | null;
    setRunningAction(null);

    if (!response.ok || data?.error) {
      setError(data?.error ?? `${actionLabels[action]} failed.`);
      return;
    }

    setMessage(`${actionLabels[action]} completed. ${stringifyResult(data?.result)}`);
    await loadSnapshot();
  }

  useEffect(() => {
    void loadSnapshot();
  }, [loadSnapshot]);

  const groupedChecks = useMemo(() => {
    const groups = new Map<string, ReadinessCheck[]>();
    for (const item of snapshot?.checks ?? []) {
      groups.set(item.area, [...(groups.get(item.area) ?? []), item]);
    }
    return Array.from(groups.entries());
  }, [snapshot?.checks]);

  if (loading && !snapshot) {
    return (
      <section className="rounded-lg border border-ink/10 bg-white p-8 text-center shadow-soft">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-moss" />
        <p className="mt-3 text-sm text-ink/55">Auditing LETW reliability, documents, mobile readiness, search, backups, and monitoring...</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {error ? (
        <div className="rounded-lg border border-clay/20 bg-clay/10 px-4 py-3 text-sm text-clay">{error}</div>
      ) : null}
      {message ? (
        <div className="rounded-lg border border-moss/20 bg-mint px-4 py-3 text-sm text-ink">{message}</div>
      ) : null}

      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-moss">
              <ShieldCheck className="h-4 w-4" />
              LETW 360 platform excellence
            </p>
            <h2 className="mt-2 text-3xl font-semibold text-ink">Operational strength score</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
              A live admin audit of reliability, document editing, mobile readiness, enterprise search, backups, monitoring, and security posture.
            </p>
          </div>
          <div className="rounded-lg border border-ink/10 bg-paper px-6 py-4 text-center">
            <p className={`text-5xl font-semibold ${scoreClass(snapshot?.overallScore ?? 0)}`}>{snapshot?.overallScore ?? 0}</p>
            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-ink/50">overall score</p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {(snapshot?.byArea ?? []).map((area) => {
          const Icon = areaIcons[area.area] ?? ShieldCheck;

          return (
            <div className="rounded-lg border border-ink/10 bg-white p-4" key={area.area}>
              <div className="flex items-center justify-between gap-3">
                <Icon className="h-5 w-5 text-moss" />
                <Badge className={area.warnings ? "bg-wheat" : undefined}>{area.warnings} warning(s)</Badge>
              </div>
              <p className={`mt-4 text-3xl font-semibold ${scoreClass(area.score)}`}>{area.score}</p>
              <p className="mt-1 text-sm font-medium text-ink">{area.area}</p>
            </div>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-4">
          {groupedChecks.map(([area, checks]) => (
            <div className="rounded-lg border border-ink/10 bg-white" key={area}>
              <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-3">
                <h3 className="text-sm font-semibold text-ink">{area}</h3>
                <Badge>{checks.length} checks</Badge>
              </div>
              <div className="divide-y divide-ink/10">
                {checks.map((item) => (
                  <div className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-start sm:justify-between" key={`${item.area}-${item.label}`}>
                    <div>
                      <p className="flex items-center gap-2 text-sm font-medium text-ink">
                        {item.status === "READY" ? <CheckCircle2 className="h-4 w-4 text-moss" /> : <AlertTriangle className="h-4 w-4 text-clay" />}
                        {item.label}
                      </p>
                      <p className="mt-1 text-xs leading-5 text-ink/55">{item.detail}</p>
                    </div>
                    <Badge className={statusClass(item.status)}>{item.status.toLowerCase()}</Badge>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-4">
          <section className="rounded-lg border border-ink/10 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-ink">Admin actions</h3>
                <p className="mt-1 text-xs text-ink/55">Run safe maintenance without opening the server console.</p>
              </div>
              <Button className="h-9 px-3" variant="secondary" onClick={loadSnapshot} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
            <div className="mt-4 grid gap-2">
              {(Object.keys(actionLabels) as ActionKey[]).map((action) => (
                <Button
                  className="justify-start"
                  key={action}
                  variant={action === "CREATE_BACKUP" ? "primary" : "secondary"}
                  onClick={() => runAction(action)}
                  disabled={Boolean(runningAction)}
                >
                  {runningAction === action ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
                  {actionLabels[action]}
                </Button>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-ink/10 bg-white p-4">
            <h3 className="text-sm font-semibold text-ink">Key metrics</h3>
            <div className="mt-3 divide-y divide-ink/10">
              {Object.entries(snapshot?.metrics ?? {}).map(([key, value]) => (
                <div className="flex items-center justify-between gap-3 py-2 text-sm" key={key}>
                  <span className="text-ink/55">{key.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
                  <span className="max-w-40 truncate text-right font-medium text-ink">
                    {key.toLowerCase().includes("bytes") && typeof value === "number" ? formatBytes(value) : value ?? "none"}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-ink/10 bg-white p-4">
            <h3 className="text-sm font-semibold text-ink">Monitor warnings</h3>
            <p className="mt-1 text-xs text-ink/50">Last checked {snapshot?.monitor.checkedAt ? new Date(snapshot.monitor.checkedAt).toLocaleString() : "not yet"}</p>
            <div className="mt-3 space-y-2">
              {snapshot?.monitor.warnings.length ? (
                snapshot.monitor.warnings.map((warning) => (
                  <p className="rounded-md border border-clay/15 bg-clay/10 px-3 py-2 text-xs leading-5 text-clay" key={warning}>
                    {warning}
                  </p>
                ))
              ) : (
                <p className="rounded-md border border-moss/15 bg-mint px-3 py-2 text-xs leading-5 text-ink">
                  No active monitor warnings.
                </p>
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
