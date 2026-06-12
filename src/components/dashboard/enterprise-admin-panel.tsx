"use client";

import { useEffect, useState } from "react";
import { ArchiveRestore, DatabaseBackup, Download, Loader2, Plus, ShieldAlert, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type RecycleItem = {
  id: string;
  itemType: string;
  displayName: string;
  deletedAt: string;
  restoreUntil: string;
};

type Backup = {
  id: string;
  name: string;
  status: string;
  size?: number | null;
  createdAt: string;
};

type DlpRule = { id: string; name: string; action: string; enabled: boolean };
type DlpIncident = { id: string; classification: string; action: string; status: string; createdAt: string };

export function EnterpriseAdminPanel() {
  const [recycleItems, setRecycleItems] = useState<RecycleItem[]>([]);
  const [backups, setBackups] = useState<Backup[]>([]);
  const [rules, setRules] = useState<DlpRule[]>([]);
  const [incidents, setIncidents] = useState<DlpIncident[]>([]);
  const [backupName, setBackupName] = useState("LETW organization backup");
  const [ruleName, setRuleName] = useState("");
  const [pattern, setPattern] = useState("");
  const [action, setAction] = useState("RESTRICT");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const [recycleResponse, backupResponse, dlpResponse] = await Promise.all([
      fetch("/api/admin/recycle-bin"),
      fetch("/api/admin/backups"),
      fetch("/api/admin/dlp")
    ]);
    const [recycle, backupData, dlp] = await Promise.all([
      recycleResponse.json(),
      backupResponse.json(),
      dlpResponse.json()
    ]);
    setRecycleItems(recycle.items ?? []);
    setBackups(backupData.backups ?? []);
    setRules(dlp.rules ?? []);
    setIncidents(dlp.incidents ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function recycleAction(id: string, nextAction: "RESTORE" | "PURGE") {
    const response = await fetch("/api/admin/recycle-bin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: nextAction })
    });
    if (response.ok) setRecycleItems((current) => current.filter((item) => item.id !== id));
  }

  async function createBackup() {
    setError("");
    const response = await fetch("/api/admin/backups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: backupName, workspaceId: null })
    });
    const data = (await response.json().catch(() => null)) as { backup?: Backup; error?: string } | null;
    if (!response.ok || !data?.backup) {
      setError(data?.error ?? "Backup could not be created.");
      return;
    }
    setBackups((current) => [data.backup as Backup, ...current]);
  }

  async function createRule() {
    setError("");
    const response = await fetch("/api/admin/dlp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: ruleName, pattern, action })
    });
    const data = (await response.json().catch(() => null)) as { rule?: DlpRule; error?: string } | null;
    if (!response.ok || !data?.rule) {
      setError(data?.error ?? "DLP rule could not be created.");
      return;
    }
    setRules((current) => [data.rule as DlpRule, ...current]);
    setRuleName("");
    setPattern("");
  }

  return (
    <div className="space-y-6">
      {error ? <p className="rounded-md bg-clay/10 px-4 py-3 text-sm text-clay">{error}</p> : null}
      {loading ? <p className="flex items-center gap-2 text-sm text-ink/55"><Loader2 className="h-4 w-4 animate-spin" />Loading enterprise controls</p> : null}

      <section className="rounded-lg border border-ink/10 bg-white">
        <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
          <div className="flex items-center gap-2"><ArchiveRestore className="h-4 w-4 text-moss" /><h2 className="font-semibold">Recycle bin</h2></div>
          <span className="text-xs text-ink/45">{recycleItems.length} restorable</span>
        </div>
        <div className="divide-y divide-ink/10">
          {!recycleItems.length && !loading ? <p className="p-4 text-sm text-ink/55">The recycle bin is empty.</p> : null}
          {recycleItems.map((item) => (
            <div key={item.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">{item.displayName}</p>
                <p className="text-xs text-ink/50">{item.itemType.toLowerCase()} · restore until {new Date(item.restoreUntil).toLocaleDateString()}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => recycleAction(item.id, "RESTORE")}><ArchiveRestore className="h-4 w-4" />Restore</Button>
                <Button variant="danger" onClick={() => recycleAction(item.id, "PURGE")}><Trash2 className="h-4 w-4" />Purge</Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-ink/10 bg-white">
        <div className="flex items-center gap-2 border-b border-ink/10 px-4 py-3">
          <DatabaseBackup className="h-4 w-4 text-moss" /><h2 className="font-semibold">Backups and recovery</h2>
        </div>
        <div className="flex flex-col gap-3 border-b border-ink/10 p-4 sm:flex-row">
          <Input value={backupName} onChange={(event) => setBackupName(event.target.value)} />
          <Button className="shrink-0" onClick={createBackup}><DatabaseBackup className="h-4 w-4" />Create backup</Button>
        </div>
        <div className="divide-y divide-ink/10">
          {backups.map((backup) => (
            <div key={backup.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div><p className="text-sm font-medium">{backup.name}</p><p className="text-xs text-ink/50">{backup.status.toLowerCase()} · {new Date(backup.createdAt).toLocaleString()}</p></div>
              {backup.status === "COMPLETED" ? (
                <a className="inline-flex h-9 items-center gap-2 rounded-md border border-ink/10 px-3 text-sm font-medium hover:bg-mint/50" href={`/api/admin/backups?download=${backup.id}`}>
                  <Download className="h-4 w-4" />Download
                </a>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-ink/10 bg-white">
        <div className="flex items-center gap-2 border-b border-ink/10 px-4 py-3">
          <ShieldAlert className="h-4 w-4 text-moss" /><h2 className="font-semibold">Data-loss prevention</h2>
        </div>
        <div className="grid gap-3 border-b border-ink/10 p-4 lg:grid-cols-[1fr_1fr_10rem_auto]">
          <Input placeholder="Rule name" value={ruleName} onChange={(event) => setRuleName(event.target.value)} />
          <Input placeholder="Regular expression" value={pattern} onChange={(event) => setPattern(event.target.value)} />
          <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" value={action} onChange={(event) => setAction(event.target.value)}>
            <option value="WARN">Warn</option><option value="RESTRICT">Restrict</option><option value="BLOCK">Block</option>
          </select>
          <Button onClick={createRule}><Plus className="h-4 w-4" />Add rule</Button>
        </div>
        <div className="grid gap-0 lg:grid-cols-2">
          <div className="divide-y divide-ink/10 border-b border-ink/10 lg:border-b-0 lg:border-r">
            {rules.map((rule) => <div key={rule.id} className="px-4 py-3 text-sm"><p className="font-medium">{rule.name}</p><p className="text-xs text-ink/50">{rule.action.toLowerCase()} · {rule.enabled ? "active" : "paused"}</p></div>)}
          </div>
          <div className="divide-y divide-ink/10">
            {incidents.slice(0, 20).map((incident) => <div key={incident.id} className="px-4 py-3 text-sm"><p className="font-medium">{incident.classification}</p><p className="text-xs text-ink/50">{incident.action.toLowerCase()} · {incident.status.toLowerCase()} · {new Date(incident.createdAt).toLocaleString()}</p></div>)}
          </div>
        </div>
      </section>
    </div>
  );
}
