"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import {
  BellRing,
  Bot,
  CalendarHeart,
  CheckCircle2,
  Church,
  FileSearch,
  Globe2,
  Loader2,
  MapPinned,
  MessageSquareLock,
  Mic,
  ReceiptText,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  UsersRound
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatBytes, formatDate } from "@/lib/utils";

type MetricData = {
  members: number;
  units: number;
  workspaces: number;
  upcomingMilestones: number;
  silentAbsences: number;
  activeGivingReceipts: number;
  givingTotalLabel: string;
  openTasks: number;
  activeShareLinks: number;
  aiAgents: number;
  documents: number;
  storageBytes: number;
  impactScore: number;
};

type DirectoryMember = {
  id: string;
  name: string | null;
  email: string | null;
  category: string | null;
  department: { name: string; kind: string } | null;
  profile: {
    phone: string | null;
    membershipNumber: string | null;
    membershipStatus: string;
    organizationPosition: string | null;
    digitalIdLocation: string;
    currentOrganizationUnitId: string | null;
    skills: unknown;
    ministryInterests: unknown;
  };
  workspaces: Array<{ id: string; name: string; role: string; audienceMode: string }>;
};

type WorkspaceMode = {
  id: string;
  name: string;
  audienceMode: string;
  memberDirectoryOpen: boolean;
  organizationUnitId: string | null;
  scopeType: string | null;
  _count: { members: number; files: number; chatChannels: number };
};

type ServicePlan = {
  id: string;
  title: string;
  serviceType: string;
  status: string;
  theme: string | null;
  preacher: string | null;
  startsAt: string;
  workspaceId: string | null;
  attendanceTotal: number | null;
  newVisitors: number | null;
  salvationDecisions: number | null;
  testimoniesCount: number | null;
};

type GivingReceipt = {
  id: string;
  donorName: string;
  donorEmail: string | null;
  amountCents: number;
  currency: string;
  fund: string;
  receiptNumber: string;
  status: string;
  receivedAt: string;
};

type LeadershipData = {
  access: {
    isAdmin: boolean;
    homeMode: string;
  };
  metrics: MetricData;
  workspaces: WorkspaceMode[];
  directory: DirectoryMember[];
  upcomingMilestones: Array<{ userId: string; name: string; type: string; date: string; daysAway: number }>;
  silentAbsences: Array<{ userId: string; name: string; email: string | null; phone: string | null; risk: string; reason: string }>;
  servicePlans: ServicePlan[];
  givingReceipts: GivingReceipt[];
  visitorCounts: Record<string, number>;
  followUpCounts: Record<string, number>;
  projects: Array<{ id: string; name: string; status: string; projectType: string; dueAt: string | null }>;
  documentIssues: Array<{ id: string; title: string; issueType: string; details: string | null; reviewDueAt: string | null }>;
  commandDrafts: Array<{ id: string; commandText: string; intent: string; summary: string; status: string; createdAt: string }>;
  commandMap: Array<{
    id: string;
    name: string;
    type: string;
    code: string | null;
    countryCode: string | null;
    memberCount: number;
    leaderCount: number;
  }>;
  impact: {
    score: number;
    soulsWon: number;
    salvationDecisions: number;
    baptisms: number;
    testimonies: number;
    followUpsCompleted: number;
    workersTrained: number;
    outreaches: number;
    attendanceRecords: number;
  };
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: (event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void;
  onerror: () => void;
  onend: () => void;
  start: () => void;
  stop: () => void;
};

const tabLabels = [
  "Home",
  "Directory",
  "Workspaces",
  "Services",
  "Giving",
  "Follow-up",
  "AI reports",
  "Map"
] as const;

function localDateTimeToIso(value: FormDataEntryValue | null) {
  const text = String(value ?? "");
  return text ? new Date(text).toISOString() : "";
}

function money(amountCents: number, currency = "GBP") {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(amountCents / 100);
}

function splitLines(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .split("\n")
    .flatMap((line) => line.split(","))
    .map((line) => line.trim())
    .filter(Boolean);
}

async function jsonRequest<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) {
    throw new Error(data?.error ?? "Request failed.");
  }
  return data as T;
}

function SmallMetric({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4">
      <p className="text-2xl font-semibold text-ink">{value}</p>
      <p className="text-sm text-ink/55">{label}</p>
      <p className="mt-1 text-xs text-ink/40">{detail}</p>
    </div>
  );
}

export function LeadershipSuitePanel({ initialData }: { initialData: LeadershipData }) {
  const [data, setData] = useState(initialData);
  const [activeTab, setActiveTab] = useState<(typeof tabLabels)[number]>("Home");
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState("");
  const [aiPrompt, setAiPrompt] = useState("Generate monthly branch report.");
  const [aiReport, setAiReport] = useState("");
  const [voiceCommand, setVoiceCommand] = useState("");
  const [isListening, setIsListening] = useState(false);

  const filteredMembers = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return data.directory;
    return data.directory.filter((member) =>
      [
        member.name,
        member.email,
        member.category,
        member.department?.name,
        member.profile.membershipNumber,
        member.profile.organizationPosition,
        member.profile.phone,
        member.profile.digitalIdLocation
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(value)
    );
  }, [data.directory, query]);

  async function refresh() {
    const next = await jsonRequest<LeadershipData>("/api/leadership-suite");
    setData(next);
  }

  async function runAction(action: string, success: string) {
    setLoading(action);
    setError("");
    setMessage("");
    try {
      await jsonRequest("/api/leadership-suite", {
        method: "POST",
        body: JSON.stringify({ action })
      });
      await refresh();
      setMessage(success);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Action failed.");
    } finally {
      setLoading("");
    }
  }

  async function updateWorkspaceMode(event: FormEvent<HTMLFormElement>, workspaceId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(`workspace-${workspaceId}`);
    setError("");
    setMessage("");
    try {
      await jsonRequest("/api/leadership-suite", {
        method: "PATCH",
        body: JSON.stringify({
          action: "WORKSPACE_MODE",
          workspaceId,
          audienceMode: String(form.get("audienceMode")),
          memberDirectoryOpen: form.get("memberDirectoryOpen") === "on"
        })
      });
      await refresh();
      setMessage("Workspace visibility and directory settings saved.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Workspace settings could not be saved.");
    } finally {
      setLoading("");
    }
  }

  async function createServicePlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading("service-plan");
    setError("");
    setMessage("");
    try {
      await jsonRequest("/api/leadership-suite/service-plans", {
        method: "POST",
        body: JSON.stringify({
          title: String(form.get("title")),
          serviceType: String(form.get("serviceType")),
          startsAt: localDateTimeToIso(form.get("startsAt")),
          endsAt: localDateTimeToIso(form.get("endsAt")) || null,
          workspaceId: String(form.get("workspaceId") || "") || null,
          organizationUnitId: String(form.get("organizationUnitId") || "") || null,
          theme: String(form.get("theme") || "") || null,
          preacher: String(form.get("preacher") || "") || null,
          orderOfService: splitLines(form.get("orderOfService")),
          ministers: splitLines(form.get("ministers")),
          choirSongs: splitLines(form.get("choirSongs")),
          mediaTeam: splitLines(form.get("mediaTeam")),
          prayerPoints: String(form.get("prayerPoints") || "") || null
        })
      });
      event.currentTarget.reset();
      await refresh();
      setMessage("Service plan created.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Service plan could not be created.");
    } finally {
      setLoading("");
    }
  }

  async function saveServiceReport(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(`service-${id}`);
    setError("");
    setMessage("");
    try {
      await jsonRequest("/api/leadership-suite/service-plans", {
        method: "PATCH",
        body: JSON.stringify({
          id,
          status: String(form.get("status")),
          attendanceTotal: Number(form.get("attendanceTotal") || 0),
          newVisitors: Number(form.get("newVisitors") || 0),
          salvationDecisions: Number(form.get("salvationDecisions") || 0),
          testimoniesCount: Number(form.get("testimoniesCount") || 0),
          offeringSummary: String(form.get("offeringSummary") || "") || null,
          postServiceReport: String(form.get("postServiceReport") || "") || null
        })
      });
      await refresh();
      setMessage("Service report saved.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Service report could not be saved.");
    } finally {
      setLoading("");
    }
  }

  async function issueReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading("giving");
    setError("");
    setMessage("");
    try {
      await jsonRequest("/api/giving-receipts", {
        method: "POST",
        body: JSON.stringify({
          donorName: String(form.get("donorName")),
          donorEmail: String(form.get("donorEmail") || "") || null,
          donorPhone: String(form.get("donorPhone") || "") || null,
          amountCents: Math.round(Number(form.get("amount") || 0) * 100),
          currency: String(form.get("currency") || "GBP"),
          fund: String(form.get("fund")),
          paymentMethod: String(form.get("paymentMethod") || "") || null,
          receivedAt: localDateTimeToIso(form.get("receivedAt")),
          notes: String(form.get("notes") || "") || null
        })
      });
      event.currentTarget.reset();
      await refresh();
      setMessage("Giving receipt issued with QR verification.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Receipt could not be issued.");
    } finally {
      setLoading("");
    }
  }

  async function updateReceipt(id: string, status: string) {
    setLoading(`receipt-${id}`);
    setError("");
    setMessage("");
    try {
      await jsonRequest(`/api/giving-receipts/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      await refresh();
      setMessage(`Receipt marked ${status.toLowerCase()}.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Receipt could not be updated.");
    } finally {
      setLoading("");
    }
  }

  async function generateReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading("ai-report");
    setError("");
    try {
      const result = await jsonRequest<{ report: string }>("/api/leadership-suite/ai-report", {
        method: "POST",
        body: JSON.stringify({ prompt: aiPrompt })
      });
      setAiReport(result.report);
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Report could not be generated.");
    } finally {
      setLoading("");
    }
  }

  async function saveVoiceCommand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading("voice-command");
    setError("");
    try {
      await jsonRequest("/api/leadership-suite/voice-command", {
        method: "POST",
        body: JSON.stringify({ commandText: voiceCommand })
      });
      setVoiceCommand("");
      await refresh();
      setMessage("Voice/admin command saved as a confirmation draft.");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Command could not be saved.");
    } finally {
      setLoading("");
    }
  }

  function startVoiceCapture() {
    const speechWindow = window as Window & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError("This browser does not support speech recognition. Type the command instead.");
      return;
    }
    const recognition = new Recognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-GB";
    recognition.onresult = (event) => {
      const text = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ");
      setVoiceCommand(text);
    };
    recognition.onerror = () => setError("Voice capture failed. You can still type the command.");
    recognition.onend = () => setIsListening(false);
    setIsListening(true);
    recognition.start();
  }

  const metrics = data.metrics;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <ShieldCheck className="h-4 w-4" />
              {data.access.homeMode}
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">LETW leadership command suite</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-ink/60">
              Role-based home, branch/department member directory, leadership workspace modes, service planning,
              giving receipts, milestone reminders, follow-up automation, ministry map, impact score, and safe command drafts.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Button
              variant="secondary"
              onClick={() => void runAction("SEND_MILESTONE_REMINDERS", "Milestone reminders sent to leadership.")}
              disabled={Boolean(loading)}
            >
              <BellRing className="h-4 w-4" />
              Remind leaders
            </Button>
            <Button
              variant="secondary"
              onClick={() => void runAction("RUN_FOLLOW_UP_AUTOMATION", "Follow-up automation completed.")}
              disabled={Boolean(loading)}
            >
              <Send className="h-4 w-4" />
              Run follow-up
            </Button>
            <Button
              variant="secondary"
              onClick={() => void runAction("RUN_DOCUMENT_INTELLIGENCE", "Document intelligence scan completed.")}
              disabled={Boolean(loading)}
            >
              <FileSearch className="h-4 w-4" />
              Scan documents
            </Button>
          </div>
        </div>
        {message ? <p className="mt-4 rounded-md bg-mint px-3 py-2 text-sm text-ink">{message}</p> : null}
        {error ? <p className="mt-4 rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <SmallMetric label="Impact score" value={metrics.impactScore} detail="Spiritual and operational signals" />
        <SmallMetric label="Members in scope" value={metrics.members} detail="Permission-aware directory" />
        <SmallMetric label="Workspaces" value={metrics.workspaces} detail="Leadership/admin visible" />
        <SmallMetric label="Milestones" value={metrics.upcomingMilestones} detail="Next 45 days" />
        <SmallMetric label="Giving" value={metrics.givingTotalLabel} detail={`${metrics.activeGivingReceipts} active receipt(s)`} />
        <SmallMetric label="Documents" value={metrics.documents} detail={formatBytes(metrics.storageBytes)} />
      </section>

      <div className="flex flex-wrap gap-2">
        {tabLabels.map((tab) => (
          <button
            key={tab}
            className={
              activeTab === tab
                ? "rounded-md bg-moss px-3 py-2 text-sm font-medium text-white"
                : "rounded-md border border-ink/10 bg-white px-3 py-2 text-sm font-medium text-ink hover:bg-mint/40"
            }
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Home" ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="rounded-lg border border-ink/10 bg-white p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Sparkles className="h-4 w-4 text-moss" />
              Kingdom Impact Score
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SmallMetric label="Souls/new convert signals" value={data.impact.soulsWon} detail="Visitor journey progress" />
              <SmallMetric label="Baptisms" value={data.impact.baptisms} detail="Member CRM records" />
              <SmallMetric label="Follow-ups completed" value={data.impact.followUpsCompleted} detail="Pastoral care workflow" />
              <SmallMetric label="Workers trained" value={data.impact.workersTrained} detail="Training completions" />
              <SmallMetric label="Outreaches" value={data.impact.outreaches} detail="Upcoming ministry outreach" />
              <SmallMetric label="Testimonies" value={data.impact.testimonies} detail="Service reports" />
              <SmallMetric label="Attendance records" value={data.impact.attendanceRecords} detail="Last 90 days" />
              <SmallMetric label="Silent absence risk" value={metrics.silentAbsences} detail="Needs gentle care" />
            </div>
          </div>
          <div className="rounded-lg border border-ink/10 bg-white p-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <MessageSquareLock className="h-4 w-4 text-moss" />
              Controlled collaboration
            </p>
            <p className="mt-2 text-sm leading-6 text-ink/60">
              Members can only chat in workspaces they have joined. Leadership workspaces remain private unless the admin opens specific
              directory visibility or department/category access.
            </p>
            <div className="mt-4 space-y-2 text-sm">
              <p className="flex justify-between rounded-md bg-paper px-3 py-2"><span>Open tasks</span><strong>{metrics.openTasks}</strong></p>
              <p className="flex justify-between rounded-md bg-paper px-3 py-2"><span>Live share links</span><strong>{metrics.activeShareLinks}</strong></p>
              <p className="flex justify-between rounded-md bg-paper px-3 py-2"><span>Scoped AI agents</span><strong>{metrics.aiAgents}</strong></p>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "Directory" ? (
        <section className="rounded-lg border border-ink/10 bg-white">
          <div className="flex flex-col gap-3 border-b border-ink/10 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-ink"><UsersRound className="h-4 w-4 text-moss" />Branch/department member directory</p>
              <p className="mt-1 text-xs text-ink/55">Leaders see their assigned branch, department, or open workspace members. Ordinary members cannot browse everyone.</p>
            </div>
            <div className="relative w-full md:w-80">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink/35" />
              <Input className="pl-9" placeholder="Search members..." value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
          </div>
          <div className="divide-y divide-ink/10">
            {filteredMembers.map((member) => (
              <div className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_18rem_16rem]" key={member.id}>
                <div>
                  <p className="font-semibold text-ink">{member.name ?? member.email ?? "LETW member"}</p>
                  <p className="text-sm text-ink/55">{member.email}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge>{member.profile.membershipStatus}</Badge>
                    {member.profile.organizationPosition ? <Badge className="bg-mint">{member.profile.organizationPosition}</Badge> : null}
                    {member.department ? <Badge className="bg-paper">{member.department.name}</Badge> : null}
                  </div>
                </div>
                <div className="text-sm text-ink/60">
                  <p>Member no: <span className="font-medium text-ink">{member.profile.membershipNumber ?? "Pending"}</span></p>
                  <p>Phone: <span className="font-medium text-ink">{member.profile.phone ?? "Hidden/not set"}</span></p>
                  <p>Location: <span className="font-medium text-ink">{member.profile.digitalIdLocation}</span></p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {member.workspaces.length ? member.workspaces.map((workspace) => (
                    <Badge key={`${member.id}-${workspace.id}`} className="bg-white">
                      {workspace.name}: {workspace.role.toLowerCase()}
                    </Badge>
                  )) : <span className="text-sm text-ink/45">No visible workspace roles.</span>}
                </div>
              </div>
            ))}
            {filteredMembers.length === 0 ? <p className="px-4 py-8 text-sm text-ink/55">No members found for this scope.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === "Workspaces" ? (
        <section className="grid gap-4 lg:grid-cols-2">
          {data.workspaces.map((workspace) => (
            <form className="rounded-lg border border-ink/10 bg-white p-4" key={workspace.id} onSubmit={(event) => void updateWorkspaceMode(event, workspace.id)}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">{workspace.name}</p>
                  <p className="mt-1 text-xs text-ink/50">
                    {workspace._count.members} members - {workspace._count.files} files - {workspace._count.chatChannels} channels
                  </p>
                </div>
                <Badge>{workspace.audienceMode.toLowerCase().replaceAll("_", " ")}</Badge>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-medium text-ink/60">
                  Workspace mode
                  <select name="audienceMode" className="mt-1 h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" defaultValue={workspace.audienceMode}>
                    <option value="MEMBER_FACING">Member-facing portal</option>
                    <option value="WORKER_TEAM">Worker team</option>
                    <option value="LEADERSHIP">Leadership workspace</option>
                    <option value="EXECUTIVE_BOARD">Executive board</option>
                  </select>
                </label>
                <label className="flex items-center gap-2 rounded-md border border-ink/10 bg-paper px-3 py-2 text-sm font-medium text-ink">
                  <input name="memberDirectoryOpen" type="checkbox" defaultChecked={workspace.memberDirectoryOpen} />
                  Allow members here to browse this workspace directory
                </label>
              </div>
              <Button className="mt-4" type="submit" disabled={Boolean(loading)}>
                {loading === `workspace-${workspace.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                Save workspace mode
              </Button>
            </form>
          ))}
        </section>
      ) : null}

      {activeTab === "Services" ? (
        <section className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <form className="rounded-lg border border-ink/10 bg-white p-4" onSubmit={(event) => void createServicePlan(event)}>
            <p className="flex items-center gap-2 text-sm font-semibold"><Church className="h-4 w-4 text-moss" />Create church service plan</p>
            <div className="mt-4 space-y-3">
              <Input name="title" placeholder="Sunday service, vigil, crusade..." required />
              <select name="serviceType" className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" defaultValue="SERVICE">
                <option value="SERVICE">Service</option>
                <option value="EVENT">Event</option>
                <option value="OUTREACH">Outreach</option>
                <option value="MEETING">Meeting</option>
                <option value="TRAINING">Training</option>
              </select>
              <Input name="startsAt" type="datetime-local" required />
              <Input name="endsAt" type="datetime-local" />
              <select name="workspaceId" className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">No workspace link</option>
                {data.workspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
              </select>
              <Input name="theme" placeholder="Theme" />
              <Input name="preacher" placeholder="Preacher / minister" />
              <Textarea name="orderOfService" placeholder="Order of service, one item per line" />
              <Textarea name="ministers" placeholder="Ministers, ushers, protocol, choir, media..." />
              <Textarea name="choirSongs" placeholder="Choir songs" />
              <Textarea name="mediaTeam" placeholder="Media team assignments" />
              <Textarea name="prayerPoints" placeholder="Prayer points" />
              <Button type="submit" disabled={Boolean(loading)}>
                {loading === "service-plan" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Create plan
              </Button>
            </div>
          </form>
          <div className="space-y-3">
            {data.servicePlans.map((plan) => (
              <form className="rounded-lg border border-ink/10 bg-white p-4" key={plan.id} onSubmit={(event) => void saveServiceReport(event, plan.id)}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink">{plan.title}</p>
                    <p className="text-xs text-ink/50">{formatDate(plan.startsAt)} - {plan.serviceType.toLowerCase()}</p>
                  </div>
                  <Badge>{plan.status.toLowerCase()}</Badge>
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-5">
                  <select name="status" className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm" defaultValue={plan.status}>
                    <option value="DRAFT">Draft</option>
                    <option value="READY">Ready</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="ARCHIVED">Archived</option>
                  </select>
                  <Input name="attendanceTotal" type="number" min={0} defaultValue={plan.attendanceTotal ?? 0} placeholder="Attendance" />
                  <Input name="newVisitors" type="number" min={0} defaultValue={plan.newVisitors ?? 0} placeholder="Visitors" />
                  <Input name="salvationDecisions" type="number" min={0} defaultValue={plan.salvationDecisions ?? 0} placeholder="Salvations" />
                  <Input name="testimoniesCount" type="number" min={0} defaultValue={plan.testimoniesCount ?? 0} placeholder="Testimonies" />
                </div>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <Textarea name="offeringSummary" placeholder="Offering summary" />
                  <Textarea name="postServiceReport" placeholder="Post-service report and action items" />
                </div>
                <Button className="mt-3" variant="secondary" type="submit" disabled={Boolean(loading)}>
                  {loading === `service-${plan.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  Save report
                </Button>
              </form>
            ))}
            {data.servicePlans.length === 0 ? <p className="rounded-lg border border-ink/10 bg-white p-8 text-sm text-ink/55">No service plans yet.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === "Giving" ? (
        <section className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <form className="rounded-lg border border-ink/10 bg-white p-4" onSubmit={(event) => void issueReceipt(event)}>
            <p className="flex items-center gap-2 text-sm font-semibold"><ReceiptText className="h-4 w-4 text-moss" />Issue QR-verifiable giving receipt</p>
            <div className="mt-4 space-y-3">
              <Input name="donorName" placeholder="Donor name" required />
              <Input name="donorEmail" type="email" placeholder="Donor email" />
              <Input name="donorPhone" placeholder="Phone" />
              <Input name="amount" type="number" min={0.01} step={0.01} placeholder="Amount" required />
              <Input name="currency" defaultValue="GBP" maxLength={3} />
              <Input name="fund" placeholder="Tithe, offering, missions, building..." required />
              <Input name="paymentMethod" placeholder="Bank transfer, cash, card..." />
              <Input name="receivedAt" type="datetime-local" required />
              <Textarea name="notes" placeholder="Internal notes" />
              <Button type="submit" disabled={Boolean(loading)}>
                {loading === "giving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ReceiptText className="h-4 w-4" />}
                Issue receipt
              </Button>
            </div>
          </form>
          <div className="rounded-lg border border-ink/10 bg-white">
            <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
              <p className="text-sm font-semibold">Recent receipts</p>
              <Badge>{data.givingReceipts.length}</Badge>
            </div>
            <div className="divide-y divide-ink/10">
              {data.givingReceipts.map((receipt) => (
                <div className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_12rem_18rem]" key={receipt.id}>
                  <div>
                    <p className="font-semibold text-ink">{receipt.donorName}</p>
                    <p className="text-xs text-ink/50">{receipt.receiptNumber} - {formatDate(receipt.receivedAt)}</p>
                  </div>
                  <div>
                    <p className="font-semibold text-ink">{money(receipt.amountCents, receipt.currency)}</p>
                    <Badge className={receipt.status === "ACTIVE" ? "bg-mint" : "bg-clay/10 text-clay"}>{receipt.status.toLowerCase()}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Link className="inline-flex h-9 items-center rounded-md border border-ink/10 bg-paper px-3 text-xs font-medium" href={`/api/giving-receipts/${receipt.id}/pdf`}>PDF</Link>
                    <Link className="inline-flex h-9 items-center rounded-md border border-ink/10 bg-paper px-3 text-xs font-medium" href={`/api/giving-receipts/${receipt.id}/qr`}>QR</Link>
                    {receipt.status === "ACTIVE" ? (
                      <>
                        <Button className="h-9 px-3 text-xs" variant="danger" onClick={() => void updateReceipt(receipt.id, "REVOKED")}>Revoke</Button>
                        <Button className="h-9 px-3 text-xs" variant="secondary" onClick={() => void updateReceipt(receipt.id, "VOID")}>Void</Button>
                      </>
                    ) : (
                      <Button className="h-9 px-3 text-xs" variant="secondary" onClick={() => void updateReceipt(receipt.id, "ACTIVE")}>Restore</Button>
                    )}
                  </div>
                </div>
              ))}
              {data.givingReceipts.length === 0 ? <p className="px-4 py-8 text-sm text-ink/55">No giving receipts yet.</p> : null}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "Follow-up" ? (
        <section className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-lg border border-ink/10 bg-white p-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><CalendarHeart className="h-4 w-4 text-moss" />Birthday and anniversary reminders</p>
            <div className="mt-3 divide-y divide-ink/10">
              {data.upcomingMilestones.map((item) => (
                <div className="flex items-center justify-between gap-3 py-3" key={`${item.userId}-${item.type}-${item.date}`}>
                  <div>
                    <p className="font-medium text-ink">{item.name}</p>
                    <p className="text-xs text-ink/50">{item.type} - {item.date}</p>
                  </div>
                  <Badge>{item.daysAway} day(s)</Badge>
                </div>
              ))}
              {data.upcomingMilestones.length === 0 ? <p className="py-8 text-sm text-ink/55">No milestones due in the next 45 days.</p> : null}
            </div>
          </div>
          <div className="rounded-lg border border-ink/10 bg-white p-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><BellRing className="h-4 w-4 text-moss" />Silent Absence Detector</p>
            <div className="mt-3 divide-y divide-ink/10">
              {data.silentAbsences.map((item) => (
                <div className="py-3" key={item.userId}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-ink">{item.name}</p>
                      <p className="text-xs text-ink/50">{item.email ?? item.phone ?? "No contact in profile"}</p>
                    </div>
                    <Badge className="bg-wheat">{item.risk}</Badge>
                  </div>
                  <p className="mt-1 text-sm text-ink/55">{item.reason}</p>
                </div>
              ))}
              {data.silentAbsences.length === 0 ? <p className="py-8 text-sm text-ink/55">No silent absence risks detected.</p> : null}
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "AI reports" ? (
        <section className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)]">
          <div className="space-y-4">
            <form className="rounded-lg border border-ink/10 bg-white p-4" onSubmit={(event) => void generateReport(event)}>
              <p className="flex items-center gap-2 text-sm font-semibold"><Bot className="h-4 w-4 text-moss" />Advanced AI report generator</p>
              <Textarea className="mt-3" value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} />
              <Button className="mt-3" type="submit" disabled={Boolean(loading)}>
                {loading === "ai-report" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Generate report
              </Button>
            </form>
            <form className="rounded-lg border border-ink/10 bg-white p-4" onSubmit={(event) => void saveVoiceCommand(event)}>
              <p className="flex items-center gap-2 text-sm font-semibold"><Mic className="h-4 w-4 text-moss" />Voice-to-admin command</p>
              <Textarea className="mt-3" value={voiceCommand} onChange={(event) => setVoiceCommand(event.target.value)} placeholder="Create a meeting for Lagos leaders Friday 7pm..." />
              <div className="mt-3 flex flex-wrap gap-2">
                <Button variant="secondary" onClick={startVoiceCapture} type="button">
                  <Mic className="h-4 w-4" />
                  {isListening ? "Listening..." : "Speak"}
                </Button>
                <Button type="submit" disabled={!voiceCommand.trim() || Boolean(loading)}>
                  Save draft
                </Button>
              </div>
            </form>
          </div>
          <div className="rounded-lg border border-ink/10 bg-white p-4">
            <p className="text-sm font-semibold">Generated report</p>
            {aiReport ? (
              <pre className="mt-3 max-h-[38rem] overflow-auto whitespace-pre-wrap rounded-md bg-paper p-4 text-sm leading-6 text-ink">{aiReport}</pre>
            ) : (
              <p className="mt-3 rounded-md bg-paper p-4 text-sm text-ink/55">Ask for reports such as monthly branch report, pastoral follow-up summary, absent members, or draft leader letter.</p>
            )}
            <div className="mt-4">
              <p className="text-sm font-semibold">Recent command drafts</p>
              <div className="mt-2 divide-y divide-ink/10">
                {data.commandDrafts.map((draft) => (
                  <div className="py-2" key={draft.id}>
                    <p className="text-sm font-medium text-ink">{draft.intent.replaceAll("_", " ").toLowerCase()}</p>
                    <p className="text-xs text-ink/55">{draft.summary}</p>
                    <p className="mt-1 line-clamp-2 text-xs text-ink/40">{draft.commandText}</p>
                  </div>
                ))}
                {data.commandDrafts.length === 0 ? <p className="py-4 text-sm text-ink/55">No command drafts yet.</p> : null}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {activeTab === "Map" ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="rounded-lg border border-ink/10 bg-white p-4">
            <p className="flex items-center gap-2 text-sm font-semibold"><MapPinned className="h-4 w-4 text-moss" />Global ministry command map</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.commandMap.map((unit) => (
                <div className="rounded-lg border border-ink/10 bg-paper p-3" key={unit.id}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-ink">{unit.name}</p>
                      <p className="text-xs text-ink/50">{unit.type.toLowerCase()} {unit.countryCode ? `- ${unit.countryCode}` : ""}</p>
                    </div>
                    <Globe2 className="h-4 w-4 text-moss" />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <p className="rounded-md bg-white px-2 py-1">{unit.memberCount} members</p>
                    <p className="rounded-md bg-white px-2 py-1">{unit.leaderCount} leaders</p>
                  </div>
                </div>
              ))}
              {data.commandMap.length === 0 ? <p className="text-sm text-ink/55">No organization units in your scope.</p> : null}
            </div>
          </div>
          <div className="rounded-lg border border-ink/10 bg-white p-4">
            <p className="text-sm font-semibold">Church document intelligence</p>
            <div className="mt-3 divide-y divide-ink/10">
              {data.documentIssues.map((issue) => (
                <div className="py-3" key={issue.id}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-ink">{issue.title}</p>
                    <Badge>{issue.issueType.toLowerCase().replaceAll("_", " ")}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-ink/55">{issue.details ?? "Review required."}</p>
                </div>
              ))}
              {data.documentIssues.length === 0 ? <p className="py-8 text-sm text-ink/55">No document intelligence issues open.</p> : null}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
