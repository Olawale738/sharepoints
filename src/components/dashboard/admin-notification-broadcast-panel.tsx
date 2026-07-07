"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { BellRing, Loader2, Mail, MessageCircle, Send, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Option = {
  id: string;
  name: string;
  detail?: string | null;
};

type Result = {
  sent: number;
  notificationCount: number;
  emailDelivery: { delivered: number; scanned: number };
  whatsApp: {
    configured: boolean;
    mode: string;
    attempted: number;
    sent: number;
    failed: number;
    skipped: number;
    errors: string[];
    note?: string | null;
  };
};

type WhatsAppConfig = {
  configured: boolean;
  graphVersion: string;
  defaultCountryCodeConfigured: boolean;
  templateConfigured: boolean;
  fallbackTemplateLanguage: string;
  templateHasBodyParams: boolean;
  setupRequired: string[];
};

const roles = ["ADMIN", "LEADER", "MODERATOR", "USER", "EDITOR", "VIEWER"];
const priorities = ["LOW", "NORMAL", "HIGH", "URGENT"];

export function AdminNotificationBroadcastPanel({
  users,
  workspaces,
  units
}: {
  users: Option[];
  workspaces: Option[];
  units: Option[];
}) {
  const [audienceType, setAudienceType] = useState("ALL");
  const [workspaceId, setWorkspaceId] = useState("");
  const [unitId, setUnitId] = useState("");
  const [role, setRole] = useState("USER");
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [href, setHref] = useState("/dashboard");
  const [priority, setPriority] = useState("NORMAL");
  const [email, setEmail] = useState(true);
  const [whatsapp, setWhatsapp] = useState(false);
  const [whatsappMode, setWhatsappMode] = useState("TEXT");
  const [whatsappTemplateName, setWhatsappTemplateName] = useState("");
  const [whatsappTemplateLanguage, setWhatsappTemplateLanguage] = useState("en");
  const [whatsappConfig, setWhatsappConfig] = useState<WhatsAppConfig | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const audienceHelp = useMemo(() => {
    if (audienceType === "ALL") return "Every active invited @letw.org member.";
    if (audienceType === "UNIT") return "Members whose profile is assigned to the selected country, region, branch, church, or ministry.";
    if (audienceType === "WORKSPACE") return "Only members invited into the selected workspace.";
    if (audienceType === "ROLE") return "Members with the selected role. Select a workspace to limit the role search.";
    return "One selected LETW member.";
  }, [audienceType]);

  useEffect(() => {
    let active = true;
    fetch("/api/admin/notification-broadcasts")
      .then((response) => response.json())
      .then((payload: { whatsApp?: WhatsAppConfig }) => {
        if (!active) return;
        setWhatsappConfig(payload.whatsApp ?? null);
        if (payload.whatsApp?.fallbackTemplateLanguage) {
          setWhatsappTemplateLanguage(payload.whatsApp.fallbackTemplateLanguage);
        }
      })
      .catch(() => {
        if (active) setWhatsappConfig(null);
      });

    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    const response = await fetch("/api/admin/notification-broadcasts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        audienceType,
        workspaceId: workspaceId || null,
        unitId: unitId || null,
        role: audienceType === "ROLE" ? role : null,
        userId: audienceType === "USER" ? userId : null,
        title,
        body,
        href,
        priority,
        whatsappMode,
        whatsappTemplateName: whatsappTemplateName || null,
        whatsappTemplateLanguage: whatsappTemplateLanguage || null,
        channels: { inApp: true, email, whatsapp }
      })
    });
    const payload = (await response.json().catch(() => null)) as Result & { error?: string };
    setLoading(false);

    if (!response.ok) {
      setError(payload?.error ?? "Broadcast failed.");
      return;
    }

    setResult(payload);
    setTitle("");
    setBody("");
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <form className="space-y-5" onSubmit={submit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-ink">
              Audience
              <select
                className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm"
                value={audienceType}
                onChange={(event) => setAudienceType(event.target.value)}
              >
                <option value="ALL">All active members</option>
                <option value="UNIT">Country / region / branch / ministry</option>
                <option value="WORKSPACE">Workspace members</option>
                <option value="ROLE">Role group</option>
                <option value="USER">One member</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-ink">
              Priority
              <select
                className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              >
                {priorities.map((item) => (
                  <option key={item} value={item}>
                    {item.toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {audienceType === "UNIT" ? (
            <label className="space-y-2 text-sm font-medium text-ink">
              Organization unit
              <select className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" value={unitId} onChange={(event) => setUnitId(event.target.value)} required>
                <option value="">Choose unit</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name} {unit.detail ? `- ${unit.detail}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {audienceType === "WORKSPACE" || audienceType === "ROLE" ? (
            <label className="space-y-2 text-sm font-medium text-ink">
              Workspace {audienceType === "ROLE" ? "(optional)" : ""}
              <select
                className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm"
                value={workspaceId}
                onChange={(event) => setWorkspaceId(event.target.value)}
                required={audienceType === "WORKSPACE"}
              >
                <option value="">All / choose workspace</option>
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {audienceType === "ROLE" ? (
            <label className="space-y-2 text-sm font-medium text-ink">
              Role
              <select className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" value={role} onChange={(event) => setRole(event.target.value)}>
                {roles.map((item) => (
                  <option key={item} value={item}>
                    {item.toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {audienceType === "USER" ? (
            <label className="space-y-2 text-sm font-medium text-ink">
              Member
              <select className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" value={userId} onChange={(event) => setUserId(event.target.value)} required>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} {user.detail ? `- ${user.detail}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <div className="rounded-md border border-ink/10 bg-paper px-3 py-2 text-xs leading-5 text-ink/60">{audienceHelp}</div>

          <label className="space-y-2 text-sm font-medium text-ink">
            Message title
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Example: Prayer meeting starts at 7 PM" required />
          </label>
          <label className="space-y-2 text-sm font-medium text-ink">
            Message body
            <Textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write the announcement, reminder, instruction, or alert." required />
          </label>
          <label className="space-y-2 text-sm font-medium text-ink">
            Open link
            <Input value={href} onChange={(event) => setHref(event.target.value)} placeholder="/dashboard" />
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-3 rounded-md border border-ink/10 bg-white p-3 text-sm">
              <input checked readOnly type="checkbox" />
              <BellRing className="h-4 w-4 text-moss" />
              In-app notification
            </label>
            <label className="flex items-center gap-3 rounded-md border border-ink/10 bg-white p-3 text-sm">
              <input checked={email} onChange={(event) => setEmail(event.target.checked)} type="checkbox" />
              <Mail className="h-4 w-4 text-moss" />
              Email delivery
            </label>
            <label className="flex items-center gap-3 rounded-md border border-ink/10 bg-white p-3 text-sm">
              <input checked={whatsapp} onChange={(event) => setWhatsapp(event.target.checked)} type="checkbox" />
              <MessageCircle className="h-4 w-4 text-moss" />
              WhatsApp delivery
            </label>
          </div>

          {whatsapp ? (
            <div className="rounded-lg border border-ink/10 bg-paper p-4">
              <div className="grid gap-3 md:grid-cols-3">
                <label className="space-y-2 text-sm font-medium text-ink">
                  WhatsApp mode
                  <select
                    className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm"
                    value={whatsappMode}
                    onChange={(event) => setWhatsappMode(event.target.value)}
                  >
                    <option value="TEXT">Free-form text</option>
                    <option value="TEMPLATE">Approved template</option>
                  </select>
                </label>
                <label className="space-y-2 text-sm font-medium text-ink">
                  Template name
                  <Input
                    disabled={whatsappMode !== "TEMPLATE"}
                    value={whatsappTemplateName}
                    onChange={(event) => setWhatsappTemplateName(event.target.value)}
                    placeholder="Use env default"
                  />
                </label>
                <label className="space-y-2 text-sm font-medium text-ink">
                  Language code
                  <Input
                    disabled={whatsappMode !== "TEMPLATE"}
                    value={whatsappTemplateLanguage}
                    onChange={(event) => setWhatsappTemplateLanguage(event.target.value)}
                    placeholder="en"
                  />
                </label>
              </div>
              <div className="mt-3 rounded-md border border-ink/10 bg-white px-3 py-2 text-xs leading-5 text-ink/60">
                {whatsappConfig?.configured ? (
                  <p>
                    WhatsApp Cloud API is configured. Graph {whatsappConfig.graphVersion}.{" "}
                    {whatsappConfig.templateConfigured ? "Default template is configured." : "No default template is configured."}
                  </p>
                ) : (
                  <p>
                    WhatsApp is not fully configured yet. Required Vercel variables:{" "}
                    {(whatsappConfig?.setupRequired.length ? whatsappConfig.setupRequired : ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"]).join(", ")}.
                  </p>
                )}
                <p className="mt-1">
                  Use approved template mode for first-time or organization-initiated WhatsApp broadcasts. Free-form text usually works only
                  inside the active WhatsApp service window.
                </p>
              </div>
            </div>
          ) : null}

          {error ? <p className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
          {result ? (
            <div className="rounded-md border border-moss/20 bg-mint/45 px-3 py-2 text-sm text-ink">
              Sent to {result.sent} member(s). Email scan: {result.emailDelivery.scanned}. WhatsApp attempted:{" "}
              {result.whatsApp.attempted}. WhatsApp sent: {result.whatsApp.sent}. Failed: {result.whatsApp.failed}. Skipped:{" "}
              {result.whatsApp.skipped}.
              {result.whatsApp.configured ? "" : " (WhatsApp provider not configured)."}
              {result.whatsApp.note ? <span className="mt-1 block">{result.whatsApp.note}</span> : null}
              {result.whatsApp.errors.length ? (
                <span className="mt-2 block rounded-md bg-white/75 p-2 text-xs text-clay">
                  {result.whatsApp.errors.join(" | ")}
                </span>
              ) : null}
            </div>
          ) : null}

          <Button disabled={loading} type="submit">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Send broadcast
          </Button>
        </form>
      </section>

      <aside className="space-y-4">
        <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <UsersRound className="h-4 w-4 text-moss" />
            Delivery guardrails
          </p>
          <div className="mt-3 space-y-2 text-xs leading-5 text-ink/60">
            <p>Only active, invited @letw.org accounts can receive broadcasts.</p>
            <p>Workspace broadcasts only reach members already invited into that workspace.</p>
            <p>Email uses the existing Resend notification delivery configuration.</p>
            <p>WhatsApp requires `WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`.</p>
            <p>Approved templates are best for first-time WhatsApp announcements.</p>
          </div>
        </div>
        <div className="rounded-lg border border-ink/10 bg-paper p-4">
          <p className="text-sm font-semibold text-ink">Available audience records</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge>{users.length} members</Badge>
            <Badge>{workspaces.length} workspaces</Badge>
            <Badge>{units.length} units</Badge>
          </div>
        </div>
      </aside>
    </div>
  );
}
