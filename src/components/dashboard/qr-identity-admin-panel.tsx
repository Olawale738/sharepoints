"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Download,
  DoorOpen,
  IdCard,
  KeyRound,
  Loader2,
  RefreshCcw,
  ShieldCheck,
  Ticket,
  Trash2,
  UserCheck,
  UsersRound
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type User = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  category?: string | null;
  memberProfile?: {
    membershipNumber?: string | null;
    organizationPosition?: string | null;
    digitalIdLocation?: string | null;
  } | null;
};

type CardRow = {
  user: User;
  card?: {
    id: string;
    organizationId: string;
    cardNumber: string;
    status: string;
    expiresAt?: string | null;
    issuedAt: string;
    qrRotationCount: number;
  } | null;
  statusTone: string;
  missingPhoto: boolean;
  missingMemberNumber: boolean;
  badges: Array<{ id: string; title: string; status: string; certificateNumber?: string | null; verifyToken: string }>;
  onboarding: Array<{ id: string; title: string; status: string; dueAt?: string | null }>;
  household: Array<{ id: string; displayName: string; relationship: string }>;
  branchTransfers: Array<{ id: string; status: string; createdAt: string }>;
};

type QrIdentityData = {
  cards: CardRow[];
  users: User[];
  accessPoints: Array<{ id: string; name: string; highSecurity: boolean }>;
  visitorPasses: Array<{ id: string; displayName: string; purpose: string; status: string; validUntil: string; scanCount: number; qrToken: string }>;
  approvals: Array<{ id: string; accessPointId: string; userId: string; validUntil?: string | null; revokedAt?: string | null }>;
  accessLogs: Array<{ id: string; decision: string; reason: string; purpose: string; suspicious: boolean; riskScore: number; createdAt: string; organizationId?: string | null }>;
  verifications: Array<{ id: string; outcome: string; organizationId?: string | null; createdAt: string }>;
  bulkLogs: Array<{ id: string; action: string; count: number; createdAt: string }>;
  liveInside: Array<{ log: { id: string; createdAt: string; organizationId?: string | null; accessPointId: string }; user?: User | null }>;
  stats: Record<string, number>;
};

const emptyData: QrIdentityData = {
  cards: [],
  users: [],
  accessPoints: [],
  visitorPasses: [],
  approvals: [],
  accessLogs: [],
  verifications: [],
  bulkLogs: [],
  liveInside: [],
  stats: {}
};

const statusClass: Record<string, string> = {
  ACTIVE: "bg-mint text-moss",
  MISSING: "bg-wheat text-ink",
  EXPIRED: "bg-wheat text-ink",
  LOST: "bg-clay/10 text-clay",
  REVOKED: "bg-clay/10 text-clay",
  SUSPENDED: "bg-clay/10 text-clay",
  DELETED: "bg-ink/10 text-ink"
};

function nameOf(user?: User | null) {
  return user?.name ?? user?.email ?? "LETW member";
}

function oneYearFromNowIso() {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString();
}

export function QrIdentityAdminPanel() {
  const [data, setData] = useState<QrIdentityData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const filteredCards = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return data.cards;
    return data.cards.filter((row) =>
      [
        row.user.name,
        row.user.email,
        row.user.category,
        row.user.memberProfile?.membershipNumber,
        row.user.memberProfile?.organizationPosition,
        row.card?.organizationId,
        row.statusTone
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(value)
    );
  }, [data.cards, query]);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/admin/qr-identity");
    const body = (await response.json().catch(() => null)) as (QrIdentityData & { error?: string }) | null;
    setLoading(false);
    if (!response.ok || !body) {
      setError(body?.error ?? "QR Identity Center could not be loaded.");
      return;
    }
    setData(body);
  }

  useEffect(() => {
    void load();
  }, []);

  async function post(action: string, payload: Record<string, unknown> = {}, message = "Saved.") {
    setBusy(action);
    setError("");
    setNotice("");
    const response = await fetch("/api/admin/qr-identity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...payload })
    });
    const body = (await response.json().catch(() => null)) as { error?: string; result?: { count?: number } } | null;
    setBusy("");
    if (!response.ok) {
      setError(body?.error ?? "QR identity action failed.");
      return;
    }
    setNotice(body?.result?.count !== undefined ? `${message} ${body.result.count} record(s) affected.` : message);
    await load();
  }

  async function submitForm(event: FormEvent<HTMLFormElement>, action: string, message: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = Object.fromEntries(new FormData(form).entries()) as Record<string, unknown>;
    for (const [key, value] of Object.entries(payload)) {
      if (value === "") payload[key] = null;
    }
    await post(action, payload, message);
    form.reset();
  }

  const metrics = [
    ["Users", data.stats.users ?? 0, UsersRound],
    ["Active cards", data.stats.activeCards ?? 0, IdCard],
    ["Missing cards", data.stats.missingCards ?? 0, AlertTriangle],
    ["Missing photos", data.stats.missingPhoto ?? 0, UserCheck],
    ["Suspicious scans", data.stats.suspiciousScans ?? 0, ShieldCheck],
    ["Inside now", data.stats.liveInside ?? 0, DoorOpen]
  ] as const;

  return (
    <div className="space-y-6">
      {notice ? <p className="rounded-md border border-moss/15 bg-mint px-4 py-3 text-sm text-moss">{notice}</p> : null}
      {error ? <p className="rounded-md bg-clay/10 px-4 py-3 text-sm text-clay">{error}</p> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {metrics.map(([label, value, Icon]) => (
          <div className="rounded-lg border border-ink/10 bg-white p-4" key={label}>
            <Icon className="h-5 w-5 text-moss" />
            <p className="mt-3 text-2xl font-semibold">{value}</p>
            <p className="text-sm text-ink/55">{label}</p>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-ink/10 bg-white p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-moss" />Bulk QR and ID actions</p>
            <p className="mt-1 text-xs text-ink/55">Generate member numbers, issue IDs, export lists, and clear QR logs.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void post("BULK_GENERATE_MEMBER_NUMBERS", { onlyMissing: true }, "Generated member numbers.")}>
              {busy === "BULK_GENERATE_MEMBER_NUMBERS" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
              Generate member numbers
            </Button>
            <Button variant="secondary" disabled={Boolean(busy)} onClick={() => void post("BULK_ISSUE_IDS", { onlyMissing: true, expiresAt: oneYearFromNowIso() }, "Issued missing IDs.")}>
              {busy === "BULK_ISSUE_IDS" ? <Loader2 className="h-4 w-4 animate-spin" /> : <IdCard className="h-4 w-4" />}
              Issue missing IDs
            </Button>
            <a className="inline-flex h-10 items-center gap-2 rounded-md border border-ink/10 px-3 text-sm font-medium hover:bg-mint/40" href="/api/admin/qr-identity?export=cards">
              <Download className="h-4 w-4" />Export CSV
            </a>
            <Button variant="danger" disabled={Boolean(busy)} onClick={() => void post("CLEAR_QR_LOGS", { confirmation: "CLEAR QR LOGS" }, "QR logs cleared.")}>
              {busy === "CLEAR_QR_LOGS" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Clear QR logs
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(22rem,0.8fr)]">
        <div className="rounded-lg border border-ink/10 bg-white">
          <div className="flex flex-col gap-3 border-b border-ink/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-semibold">Member Digital ID register</h2>
              <p className="text-xs text-ink/50">Cards, status, photos, membership numbers, badges, onboarding, family links, and branch transfer history.</p>
            </div>
            <Input className="sm:max-w-xs" placeholder="Search cards" value={query} onChange={(event) => setQuery(event.target.value)} />
          </div>
          <div className="max-h-[46rem] divide-y divide-ink/10 overflow-y-auto">
            {loading ? <p className="flex items-center gap-2 p-6 text-sm text-ink/55"><Loader2 className="h-4 w-4 animate-spin" />Loading cards</p> : null}
            {!loading && !filteredCards.length ? <p className="p-6 text-sm text-ink/55">No members found.</p> : null}
            {filteredCards.map((row) => (
              <div className="p-4" key={row.user.id}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{nameOf(row.user)}</p>
                      <Badge className={statusClass[row.statusTone] ?? "bg-paper"}>{row.statusTone.toLowerCase()}</Badge>
                      {row.missingPhoto ? <Badge className="bg-wheat text-ink">missing photo</Badge> : null}
                      {row.missingMemberNumber ? <Badge className="bg-wheat text-ink">missing member no.</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs text-ink/50">{row.user.email}</p>
                    <p className="mt-1 text-xs text-ink/50">
                      {row.card?.organizationId ?? "No organization ID"} - {row.user.memberProfile?.membershipNumber ?? "No member number"} - {row.user.memberProfile?.organizationPosition ?? "No position"}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {row.badges.map((badge) => <Badge key={badge.id}>{badge.title}</Badge>)}
                      {row.onboarding.filter((item) => item.status !== "COMPLETED").map((item) => <Badge key={item.id} className="bg-paper">{item.title}</Badge>)}
                      {row.household.map((link) => <Badge key={link.id} className="bg-mint text-moss">{link.relationship}: {link.displayName}</Badge>)}
                      {row.branchTransfers.map((transfer) => <Badge key={transfer.id} className="bg-paper">transfer {transfer.status.toLowerCase()}</Badge>)}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {row.card ? (
                      <>
                        <Button variant="secondary" onClick={() => void post("RENEW_CARD", { cardId: row.card?.id, expiresAt: oneYearFromNowIso(), rotateQr: false }, "Card renewed.")}><RefreshCcw className="h-4 w-4" />Renew</Button>
                        <Button variant="secondary" onClick={() => void post("ROTATE_QR", { cardId: row.card?.id, reason: "Admin QR rotation" }, "QR rotated.")}><KeyRound className="h-4 w-4" />Rotate QR</Button>
                        <Button variant="danger" onClick={() => void post("MARK_LOST", { cardId: row.card?.id, reason: "Reported lost by admin" }, "Card marked lost.")}><AlertTriangle className="h-4 w-4" />Lost</Button>
                      </>
                    ) : (
                      <Button onClick={() => void post("BULK_REISSUE_IDS", { userIds: [row.user.id], expiresAt: oneYearFromNowIso() }, "ID issued.")}><IdCard className="h-4 w-4" />Issue ID</Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <Panel title="Visitor temporary QR pass" icon={<Ticket className="h-4 w-4 text-moss" />}>
            <form className="space-y-3" onSubmit={(event) => void submitForm(event, "CREATE_VISITOR_PASS", "Visitor pass created.")}>
              <Input name="displayName" placeholder="Visitor name" required />
              <Input name="email" type="email" placeholder="Email" />
              <Input name="phone" placeholder="Phone" />
              <Textarea name="purpose" placeholder="Reason for visit" required />
              <Select name="accessPointId" label="Optional access point" options={data.accessPoints.map((point) => [point.id, point.name])} />
              <Input name="validUntil" type="datetime-local" required />
              <Button className="w-full" type="submit">Create visitor QR</Button>
            </form>
            <div className="mt-4 space-y-2">
              {data.visitorPasses.slice(0, 8).map((pass) => (
                <div className="rounded-md border border-ink/10 p-3 text-sm" key={pass.id}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{pass.displayName}</p>
                    <Badge>{pass.status.toLowerCase()}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink/50">{pass.purpose} - expires {new Date(pass.validUntil).toLocaleString()}</p>
                  <p className="mt-1 truncate font-mono text-xs text-ink/45">{pass.qrToken}</p>
                  {pass.status === "ACTIVE" ? <button className="mt-2 text-xs font-semibold text-clay" onClick={() => void post("REVOKE_VISITOR_PASS", { id: pass.id }, "Visitor pass revoked.")}>Revoke</button> : null}
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="High-security access approval" icon={<ShieldCheck className="h-4 w-4 text-moss" />}>
            <form className="space-y-3" onSubmit={(event) => void submitForm(event, "APPROVE_HIGH_SECURITY", "High-security access approved.")}>
              <Select name="userId" label="Choose member" options={data.users.map((user) => [user.id, nameOf(user)])} required />
              <Select name="accessPointId" label="Choose access point" options={data.accessPoints.map((point) => [point.id, `${point.name}${point.highSecurity ? " (high security)" : ""}`])} required />
              <Textarea name="reason" placeholder="Approval reason" />
              <Input name="validUntil" type="datetime-local" />
              <Button className="w-full" type="submit">Approve access</Button>
            </form>
            <div className="mt-4 space-y-2">
              {data.approvals.slice(0, 8).map((approval) => (
                <div className="rounded-md border border-ink/10 p-3 text-xs" key={approval.id}>
                  <p className="font-semibold">{nameOf(data.users.find((user) => user.id === approval.userId))}</p>
                  <p className="text-ink/50">{data.accessPoints.find((point) => point.id === approval.accessPointId)?.name ?? "Access point"}</p>
                  {!approval.revokedAt ? <button className="mt-2 font-semibold text-clay" onClick={() => void post("REVOKE_HIGH_SECURITY_APPROVAL", { id: approval.id }, "Approval revoked.")}>Revoke</button> : null}
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <Panel title="Onboarding checklist" icon={<UserCheck className="h-4 w-4 text-moss" />}>
          <form className="space-y-3" onSubmit={(event) => void submitForm(event, "CREATE_ONBOARDING_ITEM", "Onboarding item created.")}>
            <Select name="userId" label="Choose member" options={data.users.map((user) => [user.id, nameOf(user)])} required />
            <Input name="title" placeholder="Checklist item, e.g. Upload photo" required />
            <Textarea name="description" placeholder="Details" />
            <Input name="dueAt" type="datetime-local" />
            <Button className="w-full" type="submit">Add onboarding item</Button>
          </form>
        </Panel>

        <Panel title="Worker certification badge" icon={<BadgeCheck className="h-4 w-4 text-moss" />}>
          <form className="space-y-3" onSubmit={(event) => void submitForm(event, "CREATE_CERTIFICATION_BADGE", "Certification badge created.")}>
            <Select name="userId" label="Choose member" options={data.users.map((user) => [user.id, nameOf(user)])} required />
            <Input name="title" placeholder="Badge title, e.g. Media Worker" required />
            <Input name="issuer" placeholder="Issuer" />
            <Input name="certificateNumber" placeholder="Certificate number" />
            <Input name="expiresAt" type="datetime-local" />
            <Button className="w-full" type="submit">Create badge</Button>
          </form>
        </Panel>

        <Panel title="Family and household link" icon={<UsersRound className="h-4 w-4 text-moss" />}>
          <form className="space-y-3" onSubmit={(event) => void submitForm(event, "CREATE_HOUSEHOLD_LINK", "Household link created.")}>
            <Select name="primaryUserId" label="Primary member" options={data.users.map((user) => [user.id, nameOf(user)])} required />
            <Select name="relatedUserId" label="Linked LETW user if available" options={data.users.map((user) => [user.id, nameOf(user)])} />
            <Input name="displayName" placeholder="Family member name" required />
            <Input name="relationship" placeholder="Relationship, e.g. spouse, child" required />
            <Button className="w-full" type="submit">Link household</Button>
          </form>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <Panel title="Who is inside now" icon={<DoorOpen className="h-4 w-4 text-moss" />}>
          <List empty="No one has scanned in today.">
            {data.liveInside.map((item) => (
              <MiniItem key={item.log.id} title={nameOf(item.user)} subtitle={`${item.log.organizationId ?? "LETW ID"} - ${new Date(item.log.createdAt).toLocaleTimeString()}`} />
            ))}
          </List>
        </Panel>

        <Panel title="Suspicious scan detection" icon={<AlertTriangle className="h-4 w-4 text-moss" />}>
          <List empty="No suspicious scans in the latest logs.">
            {data.accessLogs.filter((log) => log.suspicious).slice(0, 12).map((log) => (
              <MiniItem key={log.id} title={`${log.purpose} - risk ${log.riskScore}`} subtitle={`${log.organizationId ?? "Unknown ID"} - ${log.reason}`} />
            ))}
          </List>
        </Panel>

        <Panel title="Bulk action audit" icon={<RefreshCcw className="h-4 w-4 text-moss" />}>
          <List empty="No bulk actions yet.">
            {data.bulkLogs.slice(0, 12).map((log) => (
              <MiniItem key={log.id} title={log.action.replaceAll("_", " ").toLowerCase()} subtitle={`${log.count} record(s) - ${new Date(log.createdAt).toLocaleString()}`} />
            ))}
          </List>
        </Panel>
      </section>
    </div>
  );
}

function Select({ label, name, options, required = false }: { label: string; name: string; options: Array<[string, string]>; required?: boolean }) {
  return (
    <select className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" name={name} required={required}>
      <option value="">{label}</option>
      {options.map(([value, text]) => <option key={`${name}-${value}`} value={value}>{text}</option>)}
    </select>
  );
}

function Panel({ children, icon, title }: { children: ReactNode; icon: ReactNode; title: string }) {
  return (
    <section className="rounded-lg border border-ink/10 bg-white p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">{icon}{title}</h2>
      {children}
    </section>
  );
}

function List({ children, empty }: { children: ReactNode; empty: string }) {
  const items = Array.isArray(children) ? children.filter(Boolean) : children;
  return <div className="space-y-2">{Array.isArray(items) && !items.length ? <p className="text-sm text-ink/55">{empty}</p> : items}</div>;
}

function MiniItem({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="rounded-md border border-ink/10 p-3">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-ink/50">{subtitle}</p>
    </div>
  );
}
