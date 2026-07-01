"use client";

import {
  CheckCircle2,
  DoorOpen,
  KeyRound,
  Loader2,
  LockKeyhole,
  Plus,
  QrCode,
  RadioReceiver,
  ShieldAlert,
  Trash2,
  XCircle
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Option = { id: string; name: string };
type AccessData = {
  accessPoints: Array<{ id: string; name: string; pointType: string; location?: string | null; active: boolean; requireLiveCard: boolean; highSecurity: boolean; requireExplicitApproval: boolean; requirePhotoMatch: boolean }>;
  rules: Array<{ id: string; accessPointId: string; subjectType: string; subjectId?: string | null; role?: string | null; canAccess: boolean; priority: number; timeStart?: string | null; timeEnd?: string | null }>;
  devices: Array<{ id: string; accessPointId: string; name: string; provider: string; deviceIdentifier?: string | null; active: boolean; lastSeenAt?: string | null }>;
  logs: Array<{ id: string; accessPointId: string; organizationId?: string | null; scannedUserId?: string | null; method: string; purpose: string; decision: string; reason: string; riskScore: number; suspicious: boolean; createdAt: string }>;
  users: Array<{ id: string; name?: string | null; email?: string | null; category?: string | null; departmentId?: string | null }>;
  workspaces: Option[];
  units: Array<{ id: string; name: string; type: string }>;
  departments: Array<{ id: string; name: string; kind: string }>;
  resources: Array<{ id: string; name: string; category: string }>;
  attendanceSessions: Array<{ id: string; title: string; targetType: string }>;
  events: Array<{ id: string; title: string; startsAt: string }>;
};

type Mode = "ACCESS_POINT" | "ACCESS_RULE" | "HARDWARE_DEVICE";

const emptyData: AccessData = {
  accessPoints: [],
  rules: [],
  devices: [],
  logs: [],
  users: [],
  workspaces: [],
  units: [],
  departments: [],
  resources: [],
  attendanceSessions: [],
  events: []
};

function titleCase(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AccessControlPanel() {
  const [data, setData] = useState<AccessData>(emptyData);
  const [mode, setMode] = useState<Mode>("ACCESS_POINT");
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [scanResult, setScanResult] = useState<null | {
    granted: boolean;
    decision: string;
    reason: string;
    accessPoint?: { name: string; pointType: string; location?: string | null } | null;
    member?: { name?: string | null; organizationId: string; membershipNumber: string; position: string; location: string } | null;
    visitor?: { name: string; purpose: string; validUntil: string } | null;
    security?: { riskScore: number; suspicious: boolean; photoMatchRequired: boolean };
    sideEffects?: Record<string, unknown>;
  }>(null);

  const pointName = useMemo(() => new Map(data.accessPoints.map((point) => [point.id, point.name])), [data.accessPoints]);
  const userName = useMemo(() => new Map(data.users.map((user) => [user.id, user.name ?? user.email ?? "Member"])), [data.users]);
  const categories = useMemo(
    () => Array.from(new Set(data.users.map((user) => user.category).filter((category): category is string => Boolean(category)))).sort(),
    [data.users]
  );

  async function load() {
    setLoading(true);
    const response = await fetch("/api/access-control");
    const body = (await response.json().catch(() => null)) as (AccessData & { error?: string }) | null;
    setLoading(false);
    if (!response.ok || !body) {
      setError(body?.error ?? "Access Control Center could not be loaded.");
      return;
    }
    setData(body);
  }

  useEffect(() => {
    void load();
  }, []);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(mode);
    setError("");
    setNotice("");
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const payload: Record<string, unknown> = { entity: mode, ...values };
    for (const key of ["workspaceId", "organizationUnitId", "resourceId", "subjectId", "role", "apiEndpoint", "deviceIdentifier", "sharedSecret", "validFrom", "validUntil", "timeStart", "timeEnd"]) {
      if (payload[key] === "") payload[key] = null;
    }
    for (const key of ["validFrom", "validUntil"]) {
      if (payload[key]) payload[key] = new Date(String(payload[key])).toISOString();
    }
    const response = await fetch("/api/access-control", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(body?.error ?? "Access-control record could not be saved.");
      return;
    }
    form.reset();
    setNotice(`${titleCase(mode)} saved.`);
    await load();
  }

  async function update(entity: string, id: string, fields: Record<string, unknown>) {
    setError("");
    const response = await fetch("/api/access-control", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity, id, ...fields })
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setError(body?.error ?? "Access-control record could not be updated.");
      return;
    }
    setNotice("Access-control record updated.");
    await load();
  }

  async function deleteRecord(entity: string, id: string) {
    setError("");
    const response = await fetch("/api/access-control", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity, id })
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setError(body?.error ?? "Access-control record could not be deleted.");
      return;
    }
    setNotice(`${titleCase(entity)} deleted.`);
    await load();
  }

  async function clearLogs() {
    setBusy("CLEAR_LOGS");
    const response = await fetch("/api/access-control", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity: "ACCESS_LOGS", confirmation: "CLEAR ACCESS LOGS" })
    });
    const body = (await response.json().catch(() => null)) as { count?: number; error?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(body?.error ?? "Access logs could not be cleared.");
      return;
    }
    setNotice(`${body?.count ?? 0} access scan logs cleared.`);
    await load();
  }

  async function scan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("SCAN");
    setError("");
    setScanResult(null);
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    const payload = {
      accessPointId: values.accessPointId,
      qrToken: values.qrToken || null,
      organizationId: values.organizationId || null,
      method: values.method || "QR",
      visitorToken: values.visitorToken || null,
      purpose: values.purpose || "ACCESS",
      attendanceSessionId: values.attendanceSessionId || null,
      eventId: values.eventId || null,
      resourceId: values.resourceId || null,
      note: values.note || null
    };
    const response = await fetch("/api/access-control/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = (await response.json().catch(() => null)) as (typeof scanResult & { error?: string }) | null;
    setBusy("");
    if (!response.ok || !body) {
      setError(body?.error ?? "Access scan failed.");
      return;
    }
    setScanResult(body);
    await load();
  }

  const metrics = [
    ["Access points", data.accessPoints.length, DoorOpen],
    ["Active rules", data.rules.filter((rule) => rule.canAccess).length, KeyRound],
    ["Hardware devices", data.devices.length, RadioReceiver],
    ["Granted today", data.logs.filter((log) => log.decision === "GRANTED" && new Date(log.createdAt).toDateString() === new Date().toDateString()).length, CheckCircle2],
    ["Denied today", data.logs.filter((log) => log.decision === "DENIED" && new Date(log.createdAt).toDateString() === new Date().toDateString()).length, ShieldAlert]
  ] as const;

  return (
    <div className="space-y-6">
      {notice ? <p className="rounded-md border border-moss/15 bg-mint px-4 py-3 text-sm text-moss">{notice}</p> : null}
      {error ? <p className="rounded-md bg-clay/10 px-4 py-3 text-sm text-clay">{error}</p> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {metrics.map(([label, value, Icon]) => (
          <div className="rounded-lg border border-ink/10 bg-white p-4" key={label}>
            <Icon className="h-5 w-5 text-moss" />
            <p className="mt-3 text-2xl font-semibold">{value}</p>
            <p className="text-sm text-ink/55">{label}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="rounded-lg border border-ink/10 bg-white">
          <div className="flex flex-wrap gap-1 border-b border-ink/10 p-2">
            {(["ACCESS_POINT", "ACCESS_RULE", "HARDWARE_DEVICE"] as const).map((item) => (
              <button
                className={`rounded-md px-3 py-2 text-sm font-medium ${mode === item ? "bg-moss text-white" : "hover:bg-mint/50"}`}
                key={item}
                type="button"
                onClick={() => setMode(item)}
              >
                {titleCase(item)}
              </button>
            ))}
          </div>
          <form className="grid gap-3 p-4 md:grid-cols-2" onSubmit={create}>
            {mode === "ACCESS_POINT" ? (
              <>
                <Input name="name" placeholder="Entrance, door, room, desk, cabinet..." required />
                <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="pointType" defaultValue="ENTRANCE">
                  {["ENTRANCE", "DOOR", "ROOM", "DESK", "CABINET", "EQUIPMENT", "VEHICLE", "KEY_BOX", "COMPUTER", "OTHER"].map((item) => <option key={item}>{item}</option>)}
                </select>
                <Input name="location" placeholder="Location" />
                <Select name="workspaceId" label="Workspace scope" options={data.workspaces.map((item) => [item.id, item.name])} />
                <Select name="organizationUnitId" label="Church network scope" options={data.units.map((item) => [item.id, `${item.type.toLowerCase()}: ${item.name}`])} />
                <Select name="resourceId" label="Linked resource" options={data.resources.map((item) => [item.id, `${item.name} (${item.category})`])} />
                <label className="flex h-10 items-center gap-2 rounded-md border border-ink/10 px-3 text-sm">
                  <input name="requireLiveCard" type="checkbox" value="true" defaultChecked />
                  Require live valid Digital ID
                </label>
                <label className="flex h-10 items-center gap-2 rounded-md border border-ink/10 px-3 text-sm">
                  <input name="highSecurity" type="checkbox" value="true" />
                  High-security point
                </label>
                <label className="flex h-10 items-center gap-2 rounded-md border border-ink/10 px-3 text-sm">
                  <input name="requireExplicitApproval" type="checkbox" value="true" />
                  Require explicit approval
                </label>
                <label className="flex h-10 items-center gap-2 rounded-md border border-ink/10 px-3 text-sm">
                  <input name="requirePhotoMatch" type="checkbox" value="true" />
                  Require photo match
                </label>
                <Textarea className="md:col-span-2" name="description" placeholder="Access instructions, door notes, controller notes, or guard instructions" />
              </>
            ) : null}
            {mode === "ACCESS_RULE" ? (
              <>
                <Select name="accessPointId" label="Choose access point" options={data.accessPoints.map((item) => [item.id, item.name])} required />
                <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="subjectType" defaultValue="ALL_ACTIVE">
                  {["ALL_ACTIVE", "USER", "ROLE", "DEPARTMENT", "CATEGORY", "WORKSPACE", "ORGANIZATION_UNIT"].map((item) => <option key={item}>{item}</option>)}
                </select>
                <Select name="subjectId" label="Subject: user, workspace, department, category or unit" options={[
                  ...data.users.map((item) => [item.id, `user: ${item.name ?? item.email ?? "Member"}`] as [string, string]),
                  ...data.workspaces.map((item) => [item.id, `workspace: ${item.name}`] as [string, string]),
                  ...data.departments.map((item) => [item.id, `${item.kind.toLowerCase()}: ${item.name}`] as [string, string]),
                  ...data.units.map((item) => [item.id, `${item.type.toLowerCase()}: ${item.name}`] as [string, string]),
                  ...categories.map((category) => [category, `category: ${category}`] as [string, string])
                ]} />
                <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="role">
                  <option value="">Role if subject type is ROLE</option>
                  {["ADMIN", "LEADER", "MODERATOR", "USER", "EDITOR", "VIEWER"].map((item) => <option key={item}>{item}</option>)}
                </select>
                <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name="canAccess" defaultValue="true">
                  <option value="true">Grant access</option>
                  <option value="false">Deny access</option>
                </select>
                <Input name="priority" type="number" min="1" defaultValue="100" placeholder="Priority" />
                <Input name="timeStart" placeholder="Start time HH:mm" />
                <Input name="timeEnd" placeholder="End time HH:mm" />
                <Input name="validFrom" type="datetime-local" />
                <Input name="validUntil" type="datetime-local" />
              </>
            ) : null}
            {mode === "HARDWARE_DEVICE" ? (
              <>
                <Select name="accessPointId" label="Choose access point" options={data.accessPoints.map((item) => [item.id, item.name])} required />
                <Input name="name" placeholder="Scanner name" required />
                <Input name="provider" defaultValue="generic" placeholder="Provider, e.g. zkteco, hikvision, esp32" />
                <Input name="deviceIdentifier" placeholder="Device identifier or serial number" />
                <Input name="apiEndpoint" type="url" placeholder="Future hardware webhook/controller URL" />
                <Input name="sharedSecret" placeholder="Shared secret for scanner API" />
              </>
            ) : null}
            <Button className="md:col-span-2" disabled={Boolean(busy)} type="submit">
              {busy === mode ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Save {titleCase(mode)}
            </Button>
          </form>
        </div>

        <section className="rounded-lg border border-ink/10 bg-white p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <QrCode className="h-4 w-4 text-moss" />
            Entrance scanner
          </p>
          <p className="mt-1 text-xs text-ink/55">Scan or paste the LETW QR token/Organization ID and select the door or resource.</p>
          {scanResult ? (
            <div className={`mt-4 rounded-md p-4 text-sm ${scanResult.granted ? "bg-mint text-moss" : "bg-clay/10 text-clay"}`}>
              <p className="flex items-center gap-2 font-semibold">
                {scanResult.granted ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {scanResult.granted ? "ACCESS GRANTED" : "ACCESS DENIED"}
              </p>
              <p className="mt-1">{scanResult.reason}</p>
              {scanResult.member ? (
                <div className="mt-3 rounded-md bg-white/70 p-3 text-ink">
                  <p className="font-semibold">{scanResult.member.name ?? "LETW Member"}</p>
                  <p className="text-xs">{scanResult.member.organizationId} - {scanResult.member.membershipNumber}</p>
                  <p className="text-xs">{scanResult.member.position} - {scanResult.member.location}</p>
                </div>
              ) : null}
              {scanResult.visitor ? (
                <div className="mt-3 rounded-md bg-white/70 p-3 text-ink">
                  <p className="font-semibold">{scanResult.visitor.name}</p>
                  <p className="text-xs">{scanResult.visitor.purpose}</p>
                  <p className="text-xs">Valid until {new Date(scanResult.visitor.validUntil).toLocaleString()}</p>
                </div>
              ) : null}
              {scanResult.security?.photoMatchRequired ? (
                <p className="mt-3 rounded-md bg-white/70 px-3 py-2 text-xs text-ink">Photo match required: compare the member photo on the verification screen before opening.</p>
              ) : null}
              {scanResult.security?.suspicious ? (
                <p className="mt-3 rounded-md bg-white/70 px-3 py-2 text-xs text-clay">Suspicious scan warning: risk score {scanResult.security.riskScore}.</p>
              ) : null}
            </div>
          ) : null}
          <form className="mt-4 space-y-3" onSubmit={scan}>
            <Select name="accessPointId" label="Choose access point" options={data.accessPoints.map((item) => [item.id, item.name])} required />
            <select className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" name="purpose" defaultValue="ACCESS">
              {["ACCESS", "ATTENDANCE", "EVENT", "RESOURCE", "EMERGENCY_ROLL_CALL", "VISITOR"].map((item) => <option key={item}>{item}</option>)}
            </select>
            <Input name="qrToken" placeholder="QR token from member card" />
            <Input name="organizationId" placeholder="Or Organization ID, e.g. LETW.ORG-..." />
            <Input name="visitorToken" placeholder="Or temporary visitor pass token" />
            <Select name="attendanceSessionId" label="Optional attendance / emergency roll-call session" options={data.attendanceSessions.map((item) => [item.id, `${item.targetType.toLowerCase()}: ${item.title}`])} />
            <Select name="eventId" label="Optional event check-in" options={data.events.map((item) => [item.id, `${item.title} (${new Date(item.startsAt).toLocaleDateString()})`])} />
            <Select name="resourceId" label="Optional resource check-in/out" options={data.resources.map((item) => [item.id, `${item.name} (${item.category})`])} />
            <select className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" name="method" defaultValue="QR">
              {["QR", "NFC_RFID", "MANUAL", "HARDWARE_API"].map((item) => <option key={item}>{item}</option>)}
            </select>
            <Textarea name="note" placeholder="Optional attendance/resource/guard note" />
            <Button className="w-full" disabled={busy === "SCAN"} type="submit">
              {busy === "SCAN" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockKeyhole className="h-4 w-4" />}
              Check access
            </Button>
          </form>
        </section>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <Panel title="Access points" loading={loading} empty={!data.accessPoints.length}>
          {data.accessPoints.map((point) => (
            <Item key={point.id} title={point.name} subtitle={`${titleCase(point.pointType)} - ${point.location ?? "No location"} - ${point.active ? "active" : "inactive"}`}>
              <div className="mt-2 flex flex-wrap gap-2">
                <SmallButton onClick={() => void update("ACCESS_POINT", point.id, { active: !point.active })}>{point.active ? "Disable" : "Enable"}</SmallButton>
                <SmallButton onClick={() => void update("ACCESS_POINT", point.id, { requireLiveCard: !point.requireLiveCard })}>{point.requireLiveCard ? "Relax live check" : "Require live check"}</SmallButton>
                <SmallButton onClick={() => void update("ACCESS_POINT", point.id, { highSecurity: !point.highSecurity })}>{point.highSecurity ? "Normal security" : "High security"}</SmallButton>
                <SmallButton onClick={() => void update("ACCESS_POINT", point.id, { requireExplicitApproval: !point.requireExplicitApproval })}>{point.requireExplicitApproval ? "No explicit approval" : "Require approval"}</SmallButton>
                <SmallButton onClick={() => void update("ACCESS_POINT", point.id, { requirePhotoMatch: !point.requirePhotoMatch })}>{point.requirePhotoMatch ? "No photo match" : "Photo match"}</SmallButton>
                <IconDelete onClick={() => void deleteRecord("ACCESS_POINT", point.id)} />
              </div>
            </Item>
          ))}
        </Panel>

        <Panel title="Access rules" loading={loading} empty={!data.rules.length}>
          {data.rules.map((rule) => (
            <Item key={rule.id} title={pointName.get(rule.accessPointId) ?? "Access point"} subtitle={`${rule.canAccess ? "Grant" : "Deny"} - ${titleCase(rule.subjectType)} - priority ${rule.priority}`}>
              <p className="mt-1 text-xs text-ink/45">{rule.role || rule.subjectId || "All active members"} {rule.timeStart && rule.timeEnd ? `- ${rule.timeStart} to ${rule.timeEnd}` : ""}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <SmallButton onClick={() => void update("ACCESS_RULE", rule.id, { canAccess: !rule.canAccess })}>{rule.canAccess ? "Make deny" : "Make grant"}</SmallButton>
                <IconDelete onClick={() => void deleteRecord("ACCESS_RULE", rule.id)} />
              </div>
            </Item>
          ))}
        </Panel>

        <Panel title="Hardware and scanner devices" loading={loading} empty={!data.devices.length}>
          {data.devices.map((device) => (
            <Item key={device.id} title={device.name} subtitle={`${device.provider} - ${pointName.get(device.accessPointId) ?? "Access point"} - ${device.active ? "active" : "inactive"}`}>
              <p className="mt-1 text-xs text-ink/45">{device.deviceIdentifier ?? "No device ID"} - last seen {device.lastSeenAt ? new Date(device.lastSeenAt).toLocaleString() : "never"}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <SmallButton onClick={() => void update("HARDWARE_DEVICE", device.id, { active: !device.active })}>{device.active ? "Disable" : "Enable"}</SmallButton>
                <IconDelete onClick={() => void deleteRecord("HARDWARE_DEVICE", device.id)} />
              </div>
            </Item>
          ))}
        </Panel>

        <Panel title="Scan logs" loading={loading} empty={!data.logs.length} action={<Button disabled={busy === "CLEAR_LOGS"} variant="danger" onClick={() => void clearLogs()}>{busy === "CLEAR_LOGS" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}Clear logs</Button>}>
          {data.logs.map((log) => (
            <Item key={log.id} title={log.decision === "GRANTED" ? "Access granted" : "Access denied"} subtitle={`${pointName.get(log.accessPointId) ?? "Access point"} - ${titleCase(log.method)} - ${new Date(log.createdAt).toLocaleString()}`}>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge className={log.decision === "GRANTED" ? "bg-mint text-moss" : "bg-clay/10 text-clay"}>{titleCase(log.decision)}</Badge>
                <Badge className={log.suspicious ? "bg-clay/10 text-clay" : "bg-paper"}>{log.purpose.toLowerCase()}</Badge>
                <span className="text-xs text-ink/50">{log.organizationId ?? userName.get(log.scannedUserId ?? "") ?? "Unknown member"}</span>
              </div>
              <p className="mt-1 text-xs text-ink/55">{log.reason} {log.riskScore ? `Risk ${log.riskScore}` : ""}</p>
            </Item>
          ))}
        </Panel>
      </section>
    </div>
  );
}

function Select({ label, name, options, required = false }: { label: string; name: string; options: Array<[string, string]>; required?: boolean }) {
  return (
    <select className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" name={name} required={required}>
      <option value="">{label}</option>
      {options.map(([value, text]) => <option key={`${name}-${value}`} value={value}>{text}</option>)}
    </select>
  );
}

function Panel({ action, children, empty, loading, title }: { action?: ReactNode; children: ReactNode; empty: boolean; loading: boolean; title: string }) {
  return (
    <section className="rounded-lg border border-ink/10 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-3">
        <h2 className="font-semibold">{title}</h2>
        {action}
      </div>
      <div className="max-h-[34rem] divide-y divide-ink/10 overflow-y-auto">
        {loading ? <p className="flex items-center gap-2 px-4 py-8 text-sm text-ink/55"><Loader2 className="h-4 w-4 animate-spin" />Loading</p> : null}
        {!loading && empty ? <p className="px-4 py-8 text-sm text-ink/55">No records yet.</p> : null}
        {children}
      </div>
    </section>
  );
}

function Item({ children, subtitle, title }: { children?: ReactNode; subtitle: string; title: string }) {
  return (
    <div className="px-4 py-3">
      <p className="text-sm font-medium text-ink">{title}</p>
      <p className="mt-1 text-xs text-ink/50">{subtitle}</p>
      {children}
    </div>
  );
}

function SmallButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="rounded-md border border-ink/10 px-2 py-1 text-xs hover:bg-mint/50" type="button" onClick={onClick}>
      {children}
    </button>
  );
}

function IconDelete({ onClick }: { onClick: () => void }) {
  return (
    <button className="inline-flex h-7 w-7 items-center justify-center rounded-md text-clay hover:bg-clay/10" type="button" onClick={onClick}>
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
