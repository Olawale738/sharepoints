"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Clock3, Loader2, Send, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";

type Option = {
  id: string;
  name?: string | null;
  email?: string | null;
  fileName?: string;
  workspace?: { name: string };
};

type Grant = {
  id: string;
  role: string;
  reason: string | null;
  expiresAt: string;
  workspace: { id: string; name: string };
  user: { name: string | null; email: string | null };
  grantedBy: { name: string | null; email: string | null };
};

type FileGrant = {
  id: string;
  accessLevel: string;
  expiresAt: string | null;
  file: { id: string; fileName: string; workspace: { name: string } };
  user: { name: string | null; email: string | null };
  grantedBy: { name: string | null; email: string | null };
};

type GrantData = {
  members: Option[];
  workspaces: Option[];
  files: Option[];
  grants: Grant[];
  fileGrants: FileGrant[];
  canManageDownloadGrants: boolean;
};

function optionLabel(option: Option) {
  return option.name ?? option.fileName ?? option.email ?? option.id;
}

export function TemporaryAccessGrantPanel() {
  const [data, setData] = useState<GrantData | null>(null);
  const [targetType, setTargetType] = useState<"WORKSPACE" | "FILE">("WORKSPACE");
  const [userId, setUserId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [role, setRole] = useState("USER");
  const [fileAccessLevel, setFileAccessLevel] = useState<"VIEW" | "DOWNLOAD">("VIEW");
  const [expiresInDays, setExpiresInDays] = useState("7");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [revokingId, setRevokingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/access-requests/grants", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as GrantData & { error?: string } | null;
    if (!response.ok || !payload) {
      setError(payload?.error ?? "Temporary grants could not be loaded.");
      return;
    }
    setData(payload);
    setUserId((current) => current || payload.members[0]?.id || "");
    setTargetId((current) => current || payload.workspaces[0]?.id || "");
  }

  useEffect(() => {
    void load();
  }, []);

  const targetOptions = useMemo(() => (targetType === "WORKSPACE" ? data?.workspaces ?? [] : data?.files ?? []), [data, targetType]);

  useEffect(() => {
    setTargetId(targetOptions[0]?.id ?? "");
  }, [targetOptions]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    const response = await fetch("/api/access-requests/grants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targetType,
        targetId,
        userId,
        role,
        fileAccessLevel,
        expiresInDays: Number(expiresInDays),
        reason
      })
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);

    if (!response.ok) {
      setError(payload?.error ?? "Temporary access could not be granted.");
      return;
    }

    setMessage("Temporary access granted.");
    setReason("");
    await load();
  }

  async function revokeFileGrant(grantId: string) {
    setRevokingId(grantId);
    setError("");
    setMessage("");
    const response = await fetch(`/api/access-requests/grants/${grantId}`, { method: "DELETE" });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    setRevokingId("");

    if (!response.ok) {
      setError(payload?.error ?? "Document permission could not be removed.");
      return;
    }

    setMessage("Document permission removed.");
    await load();
  }

  return (
    <section className="rounded-lg border border-ink/10 bg-white shadow-soft">
      <div className="border-b border-ink/10 p-5">
        <p className="flex items-center gap-2 text-sm font-medium text-moss">
          <Clock3 className="h-4 w-4" />
          Temporary access
        </p>
        <h2 className="mt-2 text-xl font-semibold text-ink">Grant expiring workspace or file access</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-ink/60">
          Give a member precise access for 1, 7, or 30 days. Expired or revoked grants stop working automatically.
        </p>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_26rem]">
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-ink">
              Member
              <select className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" value={userId} onChange={(event) => setUserId(event.target.value)} required>
                {(data?.members ?? []).map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name ?? member.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-ink">
              Access type
              <select className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" value={targetType} onChange={(event) => setTargetType(event.target.value as "WORKSPACE" | "FILE")}>
                <option value="WORKSPACE">Workspace</option>
                <option value="FILE">File only</option>
              </select>
            </label>
          </div>

          <label className="space-y-2 text-sm font-medium text-ink">
            Target
            <select className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" value={targetId} onChange={(event) => setTargetId(event.target.value)} required>
              {targetOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {targetType === "FILE" && option.workspace ? `${option.fileName} - ${option.workspace.name}` : optionLabel(option)}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-ink">
              Workspace role
              <select className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" value={role} onChange={(event) => setRole(event.target.value)} disabled={targetType === "FILE"}>
                <option value="USER">User</option>
                <option value="EDITOR">Editor</option>
              </select>
            </label>
            {targetType === "FILE" ? (
              <label className="space-y-2 text-sm font-medium text-ink">
                Document permission
                <select className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" value={fileAccessLevel} onChange={(event) => setFileAccessLevel(event.target.value as "VIEW" | "DOWNLOAD")}>
                  <option value="VIEW">View/read only</option>
                  <option value="DOWNLOAD" disabled={!data?.canManageDownloadGrants}>Download allowed by president</option>
                </select>
              </label>
            ) : (
              <label className="space-y-2 text-sm font-medium text-ink">
                Expires after
                <select className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)}>
                  <option value="1">1 day</option>
                  <option value="7">7 days</option>
                  <option value="30">30 days</option>
                </select>
              </label>
            )}
          </div>

          {targetType === "FILE" ? (
            <label className="space-y-2 text-sm font-medium text-ink">
              Expires after
              <select className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" value={expiresInDays} onChange={(event) => setExpiresInDays(event.target.value)}>
                <option value="1">1 day</option>
                <option value="7">7 days</option>
                <option value="30">30 days</option>
              </select>
            </label>
          ) : null}

          <label className="space-y-2 text-sm font-medium text-ink">
            Reason
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional reason for audit history" />
          </label>

          {error ? <p className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
          {message ? <p className="rounded-md bg-mint px-3 py-2 text-sm text-ink">{message}</p> : null}
          <Button disabled={busy || !userId || !targetId}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Grant temporary access
          </Button>
        </form>

        <aside className="rounded-lg border border-ink/10 bg-paper p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink">Active temporary workspace grants</p>
            <Badge>{data?.grants.length ?? 0}</Badge>
          </div>
          <div className="mt-3 space-y-3">
            {(data?.grants ?? []).length === 0 ? <p className="text-sm text-ink/55">No active temporary workspace grants.</p> : null}
            {(data?.grants ?? []).map((grant) => (
              <div key={grant.id} className="rounded-md border border-ink/10 bg-white p-3">
                <p className="text-sm font-semibold text-ink">{grant.user.name ?? grant.user.email}</p>
                <p className="mt-1 text-xs text-ink/55">
                  {grant.workspace.name} - {grant.role.toLowerCase()} - expires {formatDate(grant.expiresAt)}
                </p>
              </div>
            ))}
          </div>
          <div className="mt-5 border-t border-ink/10 pt-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-ink">Active document permissions</p>
              <Badge>{data?.fileGrants.length ?? 0}</Badge>
            </div>
            <div className="mt-3 space-y-3">
              {(data?.fileGrants ?? []).length === 0 ? <p className="text-sm text-ink/55">No active document permissions.</p> : null}
              {(data?.fileGrants ?? []).map((grant) => (
                <div key={grant.id} className="rounded-md border border-ink/10 bg-white p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-ink">{grant.user.name ?? grant.user.email}</p>
                      <p className="mt-1 text-xs text-ink/55">
                        {grant.file.fileName} - {grant.file.workspace.name} - {grant.accessLevel.toLowerCase()}
                        {grant.expiresAt ? ` - expires ${formatDate(grant.expiresAt)}` : ""}
                      </p>
                    </div>
                    {data?.canManageDownloadGrants ? (
                      <Button className="h-8 px-2" variant="danger" disabled={revokingId === grant.id} onClick={() => revokeFileGrant(grant.id)}>
                        {revokingId === grant.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}
