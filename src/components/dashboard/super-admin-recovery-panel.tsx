"use client";

import { FormEvent, useMemo, useState } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

type ProtectedAdminStatus = {
  email: string;
  exists: boolean;
  user?: {
    id: string;
    name?: string | null;
    email?: string | null;
    suspendedAt?: string | Date | null;
    accessRevokedAt?: string | Date | null;
    deletedAt?: string | Date | null;
    forcePasswordReset: boolean;
    updatedAt: string | Date;
  } | null;
};

type SuperAdminRecoveryPanelProps = {
  configured: boolean;
  protectedAdmins: ProtectedAdminStatus[];
};

function statusFor(admin: ProtectedAdminStatus) {
  if (!admin.exists || !admin.user) return "missing";
  if (admin.user.deletedAt) return "deleted";
  if (admin.user.accessRevokedAt) return "revoked";
  if (admin.user.suspendedAt) return "suspended";
  return "active";
}

export function SuperAdminRecoveryPanel({ configured, protectedAdmins }: SuperAdminRecoveryPanelProps) {
  const firstEmail = useMemo(() => protectedAdmins[0]?.email ?? "president@letw.org", [protectedAdmins]);
  const [email, setEmail] = useState(firstEmail);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");

    const response = await fetch("/api/admin/recovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, recoveryCode })
    });
    const data = (await response.json().catch(() => null)) as { message?: string; error?: string } | null;
    setBusy(false);

    if (!response.ok) {
      setError(data?.error ?? "Protected admin recovery failed.");
      return;
    }

    setRecoveryCode("");
    setStatus(data?.message ?? "Protected admin restored.");
  }

  return (
    <section className="rounded-lg border border-ink/10 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-moss" />
          <h2 className="text-sm font-semibold">Protected admin recovery</h2>
        </div>
        <Badge className={configured ? "bg-mint" : "bg-wheat"}>{configured ? "configured" : "needs code"}</Badge>
      </div>

      <div className="space-y-3 p-4">
        <p className="text-sm leading-6 text-ink/65">
          Protected admins cannot be suspended, revoked, or deleted. If a protected account is locked out, this recovery
          tool restores access, reactivates the invitation, and forces a fresh password reset.
        </p>

        <div className="space-y-2">
          {protectedAdmins.map((admin) => {
            const currentStatus = statusFor(admin);

            return (
              <div className="rounded-md border border-ink/10 bg-paper px-3 py-2 text-sm" key={admin.email}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-ink">{admin.user?.name ?? admin.email}</p>
                  <Badge className={currentStatus === "active" ? "bg-mint" : "bg-wheat"}>{currentStatus}</Badge>
                </div>
                <p className="mt-1 text-xs text-ink/50">
                  {admin.email}
                  {admin.user?.updatedAt ? ` - updated ${formatDate(admin.user.updatedAt)}` : ""}
                </p>
              </div>
            );
          })}
        </div>

        {error ? <p className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
        {status ? <p className="rounded-md bg-mint px-3 py-2 text-sm text-ink">{status}</p> : null}

        <form className="space-y-3" onSubmit={submit}>
          <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="president@letw.org" />
          <Input
            type="password"
            value={recoveryCode}
            onChange={(event) => setRecoveryCode(event.target.value)}
            placeholder="Protected recovery code"
          />
          <Button className="w-full" disabled={busy || !configured}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
            Restore protected admin
          </Button>
        </form>
      </div>
    </section>
  );
}
