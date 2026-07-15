"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArchiveRestore, Loader2, RefreshCw, RotateCcw, Trash2, UserRoundCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";

type RecycleItem = {
  id: string;
  itemType: string;
  itemId: string;
  label: string;
  deletedAt: string;
  restoreUntil: string;
};

type RecoveryData = {
  deletedUsers: Array<{ id: string; name: string | null; email: string | null; deletedAt: string | null; suspendedAt: string | null; accessRevokedAt: string | null }>;
  certificates: Array<{ id: string; title: string; certificateNumber: string | null; status: string; revokedAt: string | null; expiresAt: string | null }>;
  letters: Array<{ id: string; title: string; letterNumber: string; recipientName: string; status: string; revokedAt: string | null; issuedAt: string | null }>;
  reports: Array<{ id: string; title: string; status: string; month: number; year: number; createdAt: string }>;
};

type RecoveryAction =
  | "RESTORE_USER"
  | "RESTORE_CERTIFICATE"
  | "DELETE_CERTIFICATE"
  | "RESTORE_LETTER"
  | "DELETE_LETTER"
  | "RESTORE_REPORT"
  | "DELETE_REPORT";

function emptyRecovery(): RecoveryData {
  return { deletedUsers: [], certificates: [], letters: [], reports: [] };
}

function statusClass(status: string) {
  if (status === "ACTIVE" || status === "ISSUED" || status === "GENERATED") return "bg-mint text-ink";
  if (status === "REVOKED" || status === "ARCHIVED") return "bg-clay/10 text-clay";
  return "bg-wheat text-ink";
}

export function RecoveryCenterPanel() {
  const [recycleItems, setRecycleItems] = useState<RecycleItem[]>([]);
  const [recovery, setRecovery] = useState<RecoveryData>(emptyRecovery);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadData = useCallback(async () => {
    setError("");
    setLoading(true);
    const [recycleResponse, recoveryResponse] = await Promise.all([
      fetch("/api/admin/recycle-bin", { cache: "no-store" }),
      fetch("/api/admin/recovery-center", { cache: "no-store" })
    ]);
    const recycleBody = (await recycleResponse.json().catch(() => null)) as { items?: RecycleItem[]; error?: string } | null;
    const recoveryBody = (await recoveryResponse.json().catch(() => null)) as RecoveryData | { error?: string } | null;
    setLoading(false);

    if (!recycleResponse.ok || recycleBody?.error) {
      setError(recycleBody?.error ?? "Could not load recycle bin.");
      return;
    }

    if (!recoveryResponse.ok || !recoveryBody || "error" in recoveryBody) {
      setError((recoveryBody as { error?: string } | null)?.error ?? "Could not load recovery records.");
      return;
    }

    setRecycleItems(recycleBody?.items ?? []);
    setRecovery(recoveryBody as RecoveryData);
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const counts = useMemo(
    () => [
      { label: "Recycle bin", value: recycleItems.length },
      { label: "Deleted users", value: recovery.deletedUsers.length },
      { label: "Certificates", value: recovery.certificates.length },
      { label: "Letters", value: recovery.letters.length },
      { label: "Reports", value: recovery.reports.length }
    ],
    [recycleItems.length, recovery]
  );

  async function recycleAction(id: string, action: "RESTORE" | "PURGE") {
    if (action === "PURGE" && !window.confirm("Permanently delete this recycle-bin item?")) return;
    setBusyId(id);
    setError("");
    setMessage("");
    const response = await fetch("/api/admin/recycle-bin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action })
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusyId(null);
    if (!response.ok || body?.error) {
      setError(body?.error ?? "Recycle-bin action failed.");
      return;
    }
    setMessage(action === "RESTORE" ? "Item restored." : "Item permanently deleted.");
    await loadData();
  }

  async function recoveryAction(id: string, action: RecoveryAction) {
    if (action.startsWith("DELETE") && !window.confirm("Permanently delete this recovery record?")) return;
    setBusyId(id);
    setError("");
    setMessage("");
    const response = await fetch("/api/admin/recovery-center", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action })
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusyId(null);
    if (!response.ok || body?.error) {
      setError(body?.error ?? "Recovery action failed.");
      return;
    }
    setMessage(action.startsWith("RESTORE") ? "Record restored." : "Record permanently deleted.");
    await loadData();
  }

  if (loading && !recycleItems.length) {
    return (
      <section className="rounded-lg border border-ink/10 bg-white p-8 text-center shadow-soft">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-moss" />
        <p className="mt-3 text-sm text-ink/55">Loading recovery records...</p>
      </section>
    );
  }

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-lg border border-clay/20 bg-clay/10 px-4 py-3 text-sm text-clay">{error}</div> : null}
      {message ? <div className="rounded-lg border border-moss/20 bg-mint px-4 py-3 text-sm text-ink">{message}</div> : null}

      <section className="grid gap-3 md:grid-cols-5">
        {counts.map((item) => (
          <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft" key={item.label}>
            <p className="text-3xl font-semibold text-ink">{item.value}</p>
            <p className="mt-1 text-sm text-ink/55">{item.label}</p>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
              <ArchiveRestore className="h-5 w-5 text-moss" />
              Recycle bin
            </h2>
            <p className="mt-1 text-sm text-ink/55">Restore or permanently delete files, folders, workspaces, and deleted chat messages.</p>
          </div>
          <Button variant="secondary" onClick={loadData} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>
        <div className="mt-4 divide-y divide-ink/10">
          {recycleItems.length ? (
            recycleItems.map((item) => (
              <div className="flex flex-col gap-3 py-3 lg:flex-row lg:items-center lg:justify-between" key={item.id}>
                <div>
                  <p className="text-sm font-medium text-ink">{item.label}</p>
                  <p className="mt-1 text-xs text-ink/55">
                    {item.itemType} - deleted {formatDate(item.deletedAt)} - restore until {formatDate(item.restoreUntil)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button className="h-9" variant="secondary" onClick={() => recycleAction(item.id, "RESTORE")} disabled={busyId === item.id}>
                    {busyId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                    Restore
                  </Button>
                  <Button className="h-9" variant="danger" onClick={() => recycleAction(item.id, "PURGE")} disabled={busyId === item.id}>
                    <Trash2 className="h-4 w-4" />
                    Delete forever
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <p className="rounded-md border border-moss/15 bg-mint px-3 py-2 text-sm text-ink">Recycle bin is empty.</p>
          )}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
            <UserRoundCheck className="h-4 w-4 text-moss" />
            Deleted users
          </h3>
          <div className="mt-3 divide-y divide-ink/10">
            {recovery.deletedUsers.length ? (
              recovery.deletedUsers.map((user) => (
                <div className="flex items-center justify-between gap-3 py-3" key={user.id}>
                  <div>
                    <p className="text-sm font-medium text-ink">{user.name ?? user.email ?? "LETW member"}</p>
                    <p className="text-xs text-ink/55">{user.deletedAt ? `Deleted ${formatDate(user.deletedAt)}` : "Deleted account"}</p>
                  </div>
                  <Button className="h-9" variant="secondary" onClick={() => recoveryAction(user.id, "RESTORE_USER")} disabled={busyId === user.id}>
                    Restore
                  </Button>
                </div>
              ))
            ) : (
              <p className="py-3 text-sm text-ink/55">No deleted users found.</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
          <h3 className="text-sm font-semibold text-ink">Certificates</h3>
          <div className="mt-3 divide-y divide-ink/10">
            {recovery.certificates.length ? (
              recovery.certificates.map((certificate) => (
                <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between" key={certificate.id}>
                  <div>
                    <p className="text-sm font-medium text-ink">{certificate.title}</p>
                    <p className="text-xs text-ink/55">{certificate.certificateNumber ?? "No certificate number"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className={statusClass(certificate.status)}>{certificate.status.toLowerCase()}</Badge>
                    <Button className="h-9" variant="secondary" onClick={() => recoveryAction(certificate.id, "RESTORE_CERTIFICATE")} disabled={busyId === certificate.id}>
                      Restore
                    </Button>
                    <Button className="h-9" variant="danger" onClick={() => recoveryAction(certificate.id, "DELETE_CERTIFICATE")} disabled={busyId === certificate.id}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-3 text-sm text-ink/55">No revoked or expired certificates found.</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
          <h3 className="text-sm font-semibold text-ink">Official letters</h3>
          <div className="mt-3 divide-y divide-ink/10">
            {recovery.letters.length ? (
              recovery.letters.map((letter) => (
                <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between" key={letter.id}>
                  <div>
                    <p className="text-sm font-medium text-ink">{letter.title}</p>
                    <p className="text-xs text-ink/55">
                      {letter.letterNumber} - {letter.recipientName}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className={statusClass(letter.status)}>{letter.status.toLowerCase()}</Badge>
                    <Button className="h-9" variant="secondary" onClick={() => recoveryAction(letter.id, "RESTORE_LETTER")} disabled={busyId === letter.id}>
                      Restore
                    </Button>
                    <Button className="h-9" variant="danger" onClick={() => recoveryAction(letter.id, "DELETE_LETTER")} disabled={busyId === letter.id}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-3 text-sm text-ink/55">No draft, revoked, or archived letters found.</p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
          <h3 className="text-sm font-semibold text-ink">Reports</h3>
          <div className="mt-3 divide-y divide-ink/10">
            {recovery.reports.length ? (
              recovery.reports.map((report) => (
                <div className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between" key={report.id}>
                  <div>
                    <p className="text-sm font-medium text-ink">{report.title}</p>
                    <p className="text-xs text-ink/55">
                      {report.month}/{report.year} - created {formatDate(report.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className={statusClass(report.status)}>{report.status.toLowerCase()}</Badge>
                    <Button className="h-9" variant="secondary" onClick={() => recoveryAction(report.id, "RESTORE_REPORT")} disabled={busyId === report.id}>
                      Restore
                    </Button>
                    <Button className="h-9" variant="danger" onClick={() => recoveryAction(report.id, "DELETE_REPORT")} disabled={busyId === report.id}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p className="py-3 text-sm text-ink/55">No archived or draft reports found.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
