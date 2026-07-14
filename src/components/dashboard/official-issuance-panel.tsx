"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Award, BadgeCheck, FileSignature, IdCard, Loader2, ShieldCheck, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type IssuanceUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  category?: string | null;
  memberProfile?: {
    organizationPosition?: string | null;
    membershipNumber?: string | null;
  } | null;
  workspaceMemberships?: Array<{ role: string; workspace: { id: string; name: string } }>;
};

type IssuanceGrant = {
  id: string;
  userId: string;
  canIssueCertificates: boolean;
  canIssueIdCards: boolean;
  canIssueLetters: boolean;
  reason?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  active: boolean;
  user: IssuanceUser;
  grantedBy: { id: string; name?: string | null; email?: string | null };
  updatedAt: string;
};

type IssuanceData = {
  users: IssuanceUser[];
  grants: IssuanceGrant[];
};

const emptyData: IssuanceData = { users: [], grants: [] };

function displayName(user?: IssuanceUser | null) {
  return user?.name ?? user?.email ?? "LETW leader";
}

function expiryFromPreset(value: string) {
  if (value === "never") return null;
  const days = Number(value);
  if (!Number.isFinite(days)) return null;
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

export function OfficialIssuancePanel() {
  const [data, setData] = useState<IssuanceData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  const filteredUsers = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return data.users;
    return data.users.filter((user) =>
      [user.name, user.email, user.category, user.memberProfile?.organizationPosition, user.memberProfile?.membershipNumber]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(value)
    );
  }, [data.users, query]);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/admin/official-issuance");
    const body = (await response.json().catch(() => null)) as (IssuanceData & { error?: string }) | null;
    setLoading(false);
    if (!response.ok || !body) {
      setError(body?.error ?? "Official issuing authority could not be loaded.");
      return;
    }
    setData(body);
  }

  useEffect(() => {
    void load();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const userId = String(formData.get("userId") ?? "");
    const expiryPreset = String(formData.get("expiresIn") ?? "never");
    const payload = {
      userId,
      canIssueCertificates: formData.get("canIssueCertificates") === "on",
      canIssueIdCards: formData.get("canIssueIdCards") === "on",
      canIssueLetters: formData.get("canIssueLetters") === "on",
      expiresAt: expiryFromPreset(expiryPreset),
      reason: String(formData.get("reason") ?? "").trim() || null
    };

    setBusy("grant");
    setNotice("");
    setError("");
    const response = await fetch("/api/admin/official-issuance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(body?.error ?? "Grant failed.");
      return;
    }
    setNotice("Official issuing authority updated.");
    form.reset();
    await load();
  }

  async function revoke(userId: string) {
    setBusy(userId);
    setNotice("");
    setError("");
    const response = await fetch("/api/admin/official-issuance", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId })
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(body?.error ?? "Revoke failed.");
      return;
    }
    setNotice("Official issuing authority revoked.");
    await load();
  }

  const activeGrants = data.grants.filter((grant) => grant.active);

  return (
    <div className="space-y-6">
      {notice ? <p className="rounded-md border border-moss/15 bg-mint px-4 py-3 text-sm text-moss">{notice}</p> : null}
      {error ? <p className="rounded-md bg-clay/10 px-4 py-3 text-sm text-clay">{error}</p> : null}

      <section className="grid gap-4 md:grid-cols-3">
        <Metric icon={<Award className="h-5 w-5" />} label="Certificate issuers" value={activeGrants.filter((grant) => grant.canIssueCertificates).length} />
        <Metric icon={<IdCard className="h-5 w-5" />} label="ID-card issuers" value={activeGrants.filter((grant) => grant.canIssueIdCards).length} />
        <Metric icon={<FileSignature className="h-5 w-5" />} label="Letter issuers" value={activeGrants.filter((grant) => grant.canIssueLetters).length} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <ShieldCheck className="h-5 w-5 text-moss" />
            Grant official issuing permission
          </h2>
          <p className="mt-1 text-sm text-ink/55">
            Only the president can grant this authority. Delegated leaders can issue only the selected official record types.
          </p>
          <form className="mt-5 space-y-4" onSubmit={(event) => void submit(event)}>
            <Input placeholder="Search leader or moderator" value={query} onChange={(event) => setQuery(event.target.value)} />
            <select className="h-11 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" name="userId" required>
              <option value="">Choose leader, moderator, or admin</option>
              {filteredUsers.map((user) => (
                <option key={user.id} value={user.id}>
                  {displayName(user)} - {user.memberProfile?.organizationPosition ?? user.category ?? "LETW"}
                </option>
              ))}
            </select>
            <div className="grid gap-3 sm:grid-cols-3">
              <Toggle name="canIssueCertificates" icon={<Award className="h-4 w-4" />} label="Certificates" />
              <Toggle name="canIssueIdCards" icon={<IdCard className="h-4 w-4" />} label="ID cards" />
              <Toggle name="canIssueLetters" icon={<FileSignature className="h-4 w-4" />} label="Letters" />
            </div>
            <select className="h-11 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" name="expiresIn" defaultValue="never">
              <option value="30">Expires in 30 days</option>
              <option value="60">Expires in 60 days</option>
              <option value="180">Expires in 180 days</option>
              <option value="365">Expires in 1 year</option>
              <option value="never">Never expire</option>
            </select>
            <Textarea name="reason" placeholder="Reason or limits, e.g. Lagos branch certificates only" />
            <Button className="w-full" disabled={Boolean(busy)} type="submit">
              {busy === "grant" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Save issuing authority
            </Button>
          </form>
        </div>

        <div className="rounded-lg border border-ink/10 bg-white shadow-soft">
          <div className="border-b border-ink/10 p-5">
            <h2 className="text-lg font-semibold text-ink">Active and past grants</h2>
            <p className="mt-1 text-sm text-ink/55">President-issued delegation with audit-ready expiry and revoke controls.</p>
          </div>
          <div className="max-h-[42rem] divide-y divide-ink/10 overflow-y-auto">
            {loading ? <p className="flex items-center gap-2 p-5 text-sm text-ink/55"><Loader2 className="h-4 w-4 animate-spin" />Loading grants</p> : null}
            {!loading && !data.grants.length ? <p className="p-5 text-sm text-ink/55">No delegated issuers yet. The president still has full issuing authority.</p> : null}
            {data.grants.map((grant) => (
              <article className="p-5" key={grant.id}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-ink">{displayName(grant.user)}</h3>
                      <Badge className={grant.active ? "bg-mint text-moss" : "bg-paper text-ink"}>{grant.active ? "active" : "inactive"}</Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink/50">{grant.user.email}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {grant.canIssueCertificates ? <Badge className="bg-mint text-moss">certificates</Badge> : null}
                      {grant.canIssueIdCards ? <Badge className="bg-mint text-moss">ID cards</Badge> : null}
                      {grant.canIssueLetters ? <Badge className="bg-mint text-moss">letters</Badge> : null}
                      <Badge>{grant.expiresAt ? `expires ${new Date(grant.expiresAt).toLocaleDateString()}` : "never expires"}</Badge>
                    </div>
                    {grant.reason ? <p className="mt-3 text-sm leading-6 text-ink/60">{grant.reason}</p> : null}
                    <p className="mt-3 text-xs text-ink/45">
                      Granted by {displayName(grant.grantedBy)} - updated {new Date(grant.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  {grant.active ? (
                    <Button variant="danger" disabled={Boolean(busy)} onClick={() => void revoke(grant.userId)}>
                      {busy === grant.userId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      Revoke
                    </Button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
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

function Toggle({ icon, label, name }: { icon: ReactNode; label: string; name: string }) {
  return (
    <label className="flex min-h-20 cursor-pointer flex-col justify-between rounded-lg border border-ink/10 bg-paper p-3 text-sm font-medium text-ink">
      <span className="flex items-center gap-2">{icon}{label}</span>
      <input className="h-4 w-4 accent-moss" name={name} type="checkbox" />
    </label>
  );
}
