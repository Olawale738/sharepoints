"use client";

import {
  BadgeCheck,
  CalendarCheck,
  CalendarDays,
  Check,
  ClipboardCheck,
  FileQuestion,
  HeartHandshake,
  Languages,
  LifeBuoy,
  Loader2,
  Plus,
  Printer,
  QrCode,
  Send,
  ShieldCheck,
  TicketCheck,
  UserRoundCheck,
  UsersRound
} from "lucide-react";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type UserOption = { id: string; name?: string | null; email?: string | null };
type WorkspaceOption = { id: string; name: string };
type Journey = {
  id: string;
  journeyType: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  stage: string;
  assignedToId?: string | null;
  nextContactAt?: string | null;
  onboardingChecklist?: Record<string, boolean> | null;
};
type JourneyNote = { id: string; journeyId: string; noteType: string; content: string; createdAt: string };
type Ticket = {
  id: string;
  category: string;
  priority: string;
  status: string;
  subject: string;
  description: string;
  assigneeId?: string | null;
  responseDueAt?: string | null;
  firstRespondedAt?: string | null;
  firstResponseMinutes?: number | null;
  createdAt: string;
};
type TicketComment = { id: string; ticketId: string; body: string; internal: boolean; createdAt: string };
type ChurchEvent = { id: string; title: string; startsAt: string; location?: string | null };
type TicketConfig = {
  eventId: string;
  capacity?: number | null;
  invitationCode?: string | null;
  requireApproval: boolean;
  badgeEnabled: boolean;
  certificateEnabled: boolean;
  paymentRequired: boolean;
  paymentAmount?: number | null;
  paymentCurrency: string;
  paymentUrl?: string | null;
};
type Registration = {
  id: string;
  eventId: string;
  userId?: string | null;
  displayName: string;
  ticketCode: string;
  qrToken: string;
  status: string;
  paymentStatus: string;
  badgePrintedAt?: string | null;
  certificateIssuedAt?: string | null;
  createdAt: string;
};
type Policy = {
  id: string;
  title: string;
  summary?: string | null;
  content: string;
  status: string;
  dueDays: number;
};
type PolicyAssignment = {
  id: string;
  policyId: string;
  userId: string;
  dueAt?: string | null;
  acknowledgedAt?: string | null;
  signatureName?: string | null;
};
type LeaveRequest = {
  id: string;
  userId: string;
  leaveType: string;
  startsAt: string;
  endsAt: string;
  reason?: string | null;
  status: string;
};
type Availability = {
  id: string;
  userId: string;
  weekday: number;
  startTime?: string | null;
  endTime?: string | null;
  status: string;
};
type Duty = {
  id: string;
  title: string;
  role?: string | null;
  startsAt: string;
  endsAt: string;
  assignedToId: string;
  substituteUserId?: string | null;
  status: string;
};

const tabs = [
  ["overview", "Overview", HeartHandshake],
  ["visitors", "Visitor journey", UsersRound],
  ["helpdesk", "Help desk", LifeBuoy],
  ["forms", "Smart forms", FileQuestion],
  ["events", "Ticketing", TicketCheck],
  ["policies", "Compliance", ShieldCheck],
  ["staff", "Staff", CalendarCheck],
  ["translate", "Translate", Languages]
] as const;

const journeyStages = [
  "REGISTERED",
  "CONTACTED",
  "COUNSELLING",
  "FOUNDATION_CLASS",
  "MEMBERSHIP_ONBOARDING",
  "COMPLETED",
  "INACTIVE"
];
const ticketStatuses = ["OPEN", "ASSIGNED", "IN_PROGRESS", "WAITING", "RESOLVED", "CLOSED"];
const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function dateTime(value?: string | null) {
  return value ? new Date(value).toLocaleString("en-GB") : "Not set";
}

function userName(users: UserOption[], id?: string | null) {
  const user = users.find((item) => item.id === id);
  return user?.name || user?.email || "Unassigned";
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) throw new Error(body?.error ?? "The request could not be completed.");
  return body as T;
}

export function PeopleOperationsPanel({
  currentUser,
  workspaces
}: {
  currentUser: { id: string; name: string; email: string };
  workspaces: WorkspaceOption[];
}) {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number][0]>("overview");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([currentUser]);
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [journeyNotes, setJourneyNotes] = useState<JourneyNote[]>([]);
  const [selectedJourneyId, setSelectedJourneyId] = useState("");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [ticketComments, setTicketComments] = useState<TicketComment[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState("");
  const [events, setEvents] = useState<ChurchEvent[]>([]);
  const [configurations, setConfigurations] = useState<TicketConfig[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [assignments, setAssignments] = useState<PolicyAssignment[]>([]);
  const [policyAudience, setPolicyAudience] = useState<string[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [duties, setDuties] = useState<Duty[]>([]);
  const [translation, setTranslation] = useState("");
  const scannedToken = useRef("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [visitorResult, helpdeskResult, eventResult, policyResult, staffResult] = await Promise.allSettled([
      api<{ journeys: Journey[]; notes: JourneyNote[]; users: UserOption[] }>("/api/visitors"),
      api<{ tickets: Ticket[]; comments: TicketComment[]; users: UserOption[]; canManage: boolean }>("/api/help-desk"),
      api<{
        events: ChurchEvent[];
        configurations: TicketConfig[];
        registrations: Registration[];
        canManage: boolean;
      }>("/api/event-ticketing"),
      api<{ policies: Policy[]; assignments: PolicyAssignment[]; users: UserOption[]; canManage: boolean }>(
        "/api/policies"
      ),
      api<{
        leaveRequests: LeaveRequest[];
        availability: Availability[];
        duties: Duty[];
        users: UserOption[];
        canManage: boolean;
      }>("/api/staff")
    ]);

    if (visitorResult.status === "fulfilled") {
      setJourneys(visitorResult.value.journeys);
      setJourneyNotes(visitorResult.value.notes);
      setUsers(visitorResult.value.users);
      setCanManage(true);
    }
    if (helpdeskResult.status === "fulfilled") {
      setTickets(helpdeskResult.value.tickets);
      setTicketComments(helpdeskResult.value.comments);
      setCanManage(helpdeskResult.value.canManage);
      if (helpdeskResult.value.users.length) setUsers(helpdeskResult.value.users);
    }
    if (eventResult.status === "fulfilled") {
      setEvents(eventResult.value.events);
      setConfigurations(eventResult.value.configurations);
      setRegistrations(eventResult.value.registrations);
    }
    if (policyResult.status === "fulfilled") {
      setPolicies(policyResult.value.policies);
      setAssignments(policyResult.value.assignments);
      if (policyResult.value.users.length) setUsers(policyResult.value.users);
    }
    if (staffResult.status === "fulfilled") {
      setLeaveRequests(staffResult.value.leaveRequests);
      setAvailability(staffResult.value.availability);
      setDuties(staffResult.value.duties);
      if (staffResult.value.users.length) setUsers(staffResult.value.users);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    if (tabs.some(([id]) => id === requestedTab)) {
      setActiveTab(requestedTab as (typeof tabs)[number][0]);
    }
  }, []);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("checkin");
    if (!canManage || !token || scannedToken.current === token) return;
    scannedToken.current = token;
    void api(
      "/api/event-ticketing",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "CHECK_IN", token })
      }
    )
      .then(async () => {
        setNotice("Ticket checked in successfully.");
        await load();
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : "Ticket check-in failed.");
      });
  }, [canManage, load]);

  const selectedJourney = journeys.find((item) => item.id === selectedJourneyId) ?? journeys[0];
  const selectedTicket = tickets.find((item) => item.id === selectedTicketId) ?? tickets[0];
  const myRegistrations = registrations.filter((item) => item.userId === currentUser.id);
  const myAssignments = assignments.filter((item) => item.userId === currentUser.id);
  const pendingPolicies = myAssignments.filter((item) => !item.acknowledgedAt);
  const metrics = [
    { label: "Active follow-ups", value: journeys.filter((item) => !["COMPLETED", "INACTIVE"].includes(item.stage)).length },
    { label: "Open help requests", value: tickets.filter((item) => !["RESOLVED", "CLOSED"].includes(item.status)).length },
    { label: "Event registrations", value: myRegistrations.length },
    { label: "Policies due", value: pendingPolicies.length },
    { label: "Upcoming duties", value: duties.filter((item) => new Date(item.endsAt) >= new Date()).length }
  ];

  async function run(key: string, work: () => Promise<unknown>, success: string) {
    setBusy(key);
    setError("");
    setNotice("");
    try {
      await work();
      setNotice(success);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The request could not be completed.");
    } finally {
      setBusy("");
    }
  }

  function json(method: string, body: unknown) {
    return { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  }

  async function createJourney(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await run(
      "journey-create",
      () =>
        api("/api/visitors", json("POST", {
          action: "CREATE",
          journeyType: data.get("journeyType"),
          firstName: data.get("firstName"),
          lastName: data.get("lastName"),
          email: data.get("email") || null,
          phone: data.get("phone") || null,
          source: data.get("source") || null,
          assignedToId: data.get("assignedToId") || null,
          workspaceId: data.get("workspaceId") || null,
          firstVisitAt: data.get("firstVisitAt") ? new Date(String(data.get("firstVisitAt"))).toISOString() : null,
          nextContactAt: data.get("nextContactAt") ? new Date(String(data.get("nextContactAt"))).toISOString() : null
        })),
      "The visitor journey has been created."
    );
    form.reset();
  }

  async function updateJourney(body: Record<string, unknown>) {
    await run("journey-update", () => api("/api/visitors", json("PATCH", body)), "Journey updated.");
  }

  async function addJourneyNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedJourney) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    await run(
      "journey-note",
      () =>
        api("/api/visitors", json("PATCH", {
          action: "NOTE",
          id: selectedJourney.id,
          noteType: data.get("noteType"),
          content: data.get("content"),
          confidential: true
        })),
      "Follow-up note saved."
    );
    form.reset();
  }

  async function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await run(
      "ticket-create",
      () =>
        api("/api/help-desk", json("POST", {
          category: data.get("category"),
          priority: data.get("priority"),
          subject: data.get("subject"),
          description: data.get("description"),
          workspaceId: data.get("workspaceId") || null
        })),
      "Your help request has been submitted."
    );
    form.reset();
  }

  async function updateTicket(body: Record<string, unknown>) {
    await run("ticket-update", () => api("/api/help-desk", json("PATCH", body)), "Help request updated.");
  }

  async function addTicketComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedTicket) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    await run(
      "ticket-comment",
      () =>
        api("/api/help-desk", json("PATCH", {
          action: "COMMENT",
          id: selectedTicket.id,
          body: data.get("body"),
          internal: canManage && data.get("internal") === "on"
        })),
      "Reply added."
    );
    form.reset();
  }

  async function configureEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await run(
      "event-configure",
      () =>
        api("/api/event-ticketing", json("POST", {
          action: "CONFIGURE",
          eventId: data.get("eventId"),
          capacity: data.get("capacity") ? Number(data.get("capacity")) : null,
          invitationCode: data.get("invitationCode") || null,
          requireApproval: data.get("requireApproval") === "on",
          badgeEnabled: data.get("badgeEnabled") === "on",
          certificateEnabled: data.get("certificateEnabled") === "on",
          paymentRequired: data.get("paymentRequired") === "on",
          paymentAmount: data.get("paymentAmount") ? Math.round(Number(data.get("paymentAmount")) * 100) : null,
          paymentCurrency: "GBP",
          paymentUrl: data.get("paymentUrl") || null
        })),
      "Event registration settings saved."
    );
  }

  async function registerForEvent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await run(
      "event-register",
      () =>
        api("/api/event-ticketing", json("POST", {
          action: "REGISTER",
          eventId: data.get("eventId"),
          displayName: data.get("displayName"),
          email: currentUser.email,
          phone: data.get("phone") || null,
          invitationCode: data.get("invitationCode") || null,
          paymentReference: data.get("paymentReference") || null
        })),
      "Event registration completed."
    );
  }

  async function eventAction(body: Record<string, unknown>, message: string) {
    await run("event-action", () => api("/api/event-ticketing", json("POST", body)), message);
  }

  async function createPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await run(
      "policy-create",
      () =>
        api("/api/policies", json("POST", {
          action: "CREATE",
          title: data.get("title"),
          summary: data.get("summary") || null,
          content: data.get("content"),
          dueDays: Number(data.get("dueDays") || 14),
          workspaceId: data.get("workspaceId") || null
        })),
      "Policy draft created."
    );
    form.reset();
  }

  async function policyAction(body: Record<string, unknown>, message: string) {
    await run("policy-action", () => api("/api/policies", json("POST", body)), message);
  }

  async function submitLeave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await run(
      "leave-create",
      () =>
        api("/api/staff", json("POST", {
          action: "LEAVE",
          leaveType: data.get("leaveType"),
          startsAt: new Date(String(data.get("startsAt"))).toISOString(),
          endsAt: new Date(String(data.get("endsAt"))).toISOString(),
          reason: data.get("reason") || null,
          workspaceId: data.get("workspaceId") || null
        })),
      "Leave request submitted."
    );
    form.reset();
  }

  async function saveAvailability(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await run(
      "availability",
      () =>
        api("/api/staff", json("POST", {
          action: "AVAILABILITY",
          weekday: Number(data.get("weekday")),
          startTime: data.get("startTime") || null,
          endTime: data.get("endTime") || null,
          status: data.get("status"),
          note: data.get("note") || null
        })),
      "Availability saved."
    );
  }

  async function createDuty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    await run(
      "duty-create",
      () =>
        api("/api/staff", json("POST", {
          action: "DUTY",
          title: data.get("title"),
          role: data.get("role") || null,
          startsAt: new Date(String(data.get("startsAt"))).toISOString(),
          endsAt: new Date(String(data.get("endsAt"))).toISOString(),
          assignedToId: data.get("assignedToId"),
          substituteUserId: data.get("substituteUserId") || null,
          workspaceId: data.get("workspaceId") || null,
          notes: data.get("notes") || null
        })),
      "Duty scheduled."
    );
    form.reset();
  }

  async function translate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setTranslation("");
    setBusy("translate");
    setError("");
    try {
      const result = await api<{ translation: string }>(
        "/api/translate",
        json("POST", { text: data.get("text"), targetLanguage: data.get("targetLanguage") })
      );
      setTranslation(result.translation);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Translation failed.");
    } finally {
      setBusy("");
    }
  }

  const visibleTabs = useMemo(
    () => tabs.filter(([id]) => id !== "visitors" || canManage),
    [canManage]
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto rounded-lg border border-ink/10 bg-white p-2">
        {visibleTabs.map(([id, title, Icon]) => (
          <button
            key={id}
            className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${
              activeTab === id ? "bg-moss text-white" : "hover:bg-mint/60"
            }`}
            onClick={() => setActiveTab(id)}
            type="button"
          >
            <Icon className="h-4 w-4" />
            {title}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex min-h-56 items-center justify-center rounded-lg border border-ink/10 bg-white">
          <Loader2 className="h-6 w-6 animate-spin text-moss" />
        </div>
      ) : null}
      {error ? <p className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
      {notice ? <p className="rounded-md bg-mint px-3 py-2 text-sm text-moss">{notice}</p> : null}

      {!loading && activeTab === "overview" ? (
        <div className="space-y-6">
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {metrics.map((metric) => (
              <div key={metric.label} className="rounded-lg border border-ink/10 bg-white p-4">
                <p className="text-2xl font-semibold">{metric.value}</p>
                <p className="mt-1 text-sm text-ink/55">{metric.label}</p>
              </div>
            ))}
          </section>
          <section className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-lg border border-ink/10 bg-white p-4">
              <ClipboardCheck className="h-5 w-5 text-moss" />
              <h2 className="mt-3 font-semibold">My immediate actions</h2>
              <div className="mt-3 space-y-2 text-sm">
                <p>{pendingPolicies.length} policy acknowledgments</p>
                <p>{leaveRequests.filter((item) => item.userId === currentUser.id && item.status === "PENDING").length} leave requests pending</p>
                <p>{duties.filter((item) => item.assignedToId === currentUser.id && new Date(item.endsAt) >= new Date()).length} upcoming duties</p>
              </div>
            </div>
            <div className="rounded-lg border border-ink/10 bg-white p-4">
              <LifeBuoy className="h-5 w-5 text-moss" />
              <h2 className="mt-3 font-semibold">Service response</h2>
              <div className="mt-3 space-y-2 text-sm">
                <p>{tickets.filter((item) => item.status === "OPEN").length} newly opened</p>
                <p>{tickets.filter((item) => item.status === "IN_PROGRESS").length} being handled</p>
                <p>{tickets.filter((item) => item.status === "RESOLVED").length} resolved</p>
              </div>
            </div>
            <div className="rounded-lg border border-ink/10 bg-white p-4">
              <CalendarDays className="h-5 w-5 text-moss" />
              <h2 className="mt-3 font-semibold">Event access</h2>
              <div className="mt-3 space-y-2 text-sm">
                <p>{events.filter((item) => new Date(item.startsAt) >= new Date()).length} upcoming events</p>
                <p>{myRegistrations.length} tickets issued to you</p>
                <p>{registrations.filter((item) => item.status === "CHECKED_IN").length} checked in</p>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {!loading && activeTab === "visitors" && canManage ? (
        <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <form className="space-y-3 rounded-lg border border-ink/10 bg-white p-4" onSubmit={createJourney}>
            <h2 className="font-semibold">Register visitor or new convert</h2>
            <select name="journeyType" className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm">
              <option value="VISITOR">Visitor</option>
              <option value="NEW_CONVERT">New convert</option>
            </select>
            <div className="grid grid-cols-2 gap-2">
              <Input name="firstName" placeholder="First name" required />
              <Input name="lastName" placeholder="Last name" required />
            </div>
            <Input name="email" type="email" placeholder="Email" />
            <Input name="phone" placeholder="Phone" />
            <Input name="source" placeholder="How did they hear about LETW?" />
            <Input name="firstVisitAt" type="datetime-local" />
            <Input name="nextContactAt" type="datetime-local" />
            <select name="assignedToId" className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm">
              <option value="">Assign later</option>
              {users.map((item) => <option key={item.id} value={item.id}>{item.name ?? item.email}</option>)}
            </select>
            <select name="workspaceId" className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm">
              <option value="">Organization-wide</option>
              {workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <Button className="w-full" disabled={busy === "journey-create"}>
              <Plus className="h-4 w-4" />Register
            </Button>
          </form>
          <section className="rounded-lg border border-ink/10 bg-white">
            <div className="grid min-h-[34rem] md:grid-cols-[17rem_minmax(0,1fr)]">
              <div className="border-b border-ink/10 p-3 md:border-b-0 md:border-r">
                <h2 className="mb-3 font-semibold">Follow-up pipeline</h2>
                <div className="space-y-1">
                  {journeys.map((item) => (
                    <button
                      key={item.id}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                        selectedJourney?.id === item.id ? "bg-moss text-white" : "hover:bg-mint"
                      }`}
                      onClick={() => setSelectedJourneyId(item.id)}
                    >
                      <span className="block font-medium">{item.firstName} {item.lastName}</span>
                      <span className="text-xs opacity-70">{label(item.stage)}</span>
                    </button>
                  ))}
                </div>
              </div>
              {selectedJourney ? (
                <div className="space-y-5 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="text-xl font-semibold">{selectedJourney.firstName} {selectedJourney.lastName}</h3>
                      <p className="text-sm text-ink/55">{selectedJourney.email ?? "No email"} · {selectedJourney.phone ?? "No phone"}</p>
                    </div>
                    <Badge>{label(selectedJourney.journeyType)}</Badge>
                  </div>
                  <div className="grid gap-3 md:grid-cols-3">
                    <label className="space-y-1 text-xs text-ink/55">Stage
                      <select
                        className="h-10 w-full rounded-md border border-ink/10 bg-white px-2 text-sm text-ink"
                        value={selectedJourney.stage}
                        onChange={(event) => void updateJourney({ action: "UPDATE", id: selectedJourney.id, stage: event.target.value })}
                      >
                        {journeyStages.map((item) => <option key={item}>{label(item)}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1 text-xs text-ink/55">Assigned worker
                      <select
                        className="h-10 w-full rounded-md border border-ink/10 bg-white px-2 text-sm text-ink"
                        value={selectedJourney.assignedToId ?? ""}
                        onChange={(event) => void updateJourney({ action: "UPDATE", id: selectedJourney.id, assignedToId: event.target.value || null })}
                      >
                        <option value="">Unassigned</option>
                        {users.map((item) => <option key={item.id} value={item.id}>{item.name ?? item.email}</option>)}
                      </select>
                    </label>
                    <label className="space-y-1 text-xs text-ink/55">Next contact
                      <Input
                        type="datetime-local"
                        defaultValue={selectedJourney.nextContactAt?.slice(0, 16) ?? ""}
                        onBlur={(event) => void updateJourney({
                          action: "UPDATE",
                          id: selectedJourney.id,
                          nextContactAt: event.target.value ? new Date(event.target.value).toISOString() : null,
                          reminderAt: event.target.value ? new Date(event.target.value).toISOString() : null
                        })}
                      />
                    </label>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">Membership onboarding</h4>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {Object.entries(selectedJourney.onboardingChecklist ?? {}).map(([key, checked]) => (
                        <label key={key} className="flex items-center gap-2 rounded-md bg-paper px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => void updateJourney({
                              action: "CHECKLIST",
                              id: selectedJourney.id,
                              checklist: { ...(selectedJourney.onboardingChecklist ?? {}), [key]: event.target.checked }
                            })}
                          />
                          {label(key)}
                        </label>
                      ))}
                    </div>
                  </div>
                  <form className="space-y-2" onSubmit={addJourneyNote}>
                    <div className="flex gap-2">
                      <select name="noteType" className="h-10 rounded-md border border-ink/10 bg-white px-2 text-sm">
                        {["GENERAL", "CALL", "COUNSELLING", "PRAYER", "ONBOARDING"].map((item) => <option key={item}>{label(item)}</option>)}
                      </select>
                      <Input name="content" placeholder="Add a private counselling or follow-up note" required />
                      <Button aria-label="Save note" disabled={busy === "journey-note"}><Send className="h-4 w-4" /></Button>
                    </div>
                  </form>
                  <div className="space-y-2">
                    {journeyNotes.filter((note) => note.journeyId === selectedJourney.id).map((note) => (
                      <div key={note.id} className="rounded-md border border-ink/10 p-3 text-sm">
                        <span className="font-medium">{label(note.noteType)}</span>
                        <p className="mt-1 text-ink/65">{note.content}</p>
                        <p className="mt-1 text-xs text-ink/40">{dateTime(note.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <p className="p-4 text-sm text-ink/55">No visitor journeys yet.</p>}
            </div>
          </section>
        </div>
      ) : null}

      {!loading && activeTab === "helpdesk" ? (
        <div className="grid gap-6 xl:grid-cols-[22rem_minmax(0,1fr)]">
          <form className="space-y-3 rounded-lg border border-ink/10 bg-white p-4" onSubmit={createTicket}>
            <h2 className="font-semibold">Submit a help request</h2>
            <select name="category" className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm">
              {["IT", "FACILITY", "FINANCE", "ADMINISTRATION", "OTHER"].map((item) => <option key={item}>{label(item)}</option>)}
            </select>
            <select name="priority" className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm">
              {["LOW", "NORMAL", "HIGH", "URGENT"].map((item) => <option key={item}>{label(item)}</option>)}
            </select>
            <Input name="subject" placeholder="What do you need help with?" required />
            <Textarea name="description" placeholder="Explain the request and the desired outcome" required />
            <select name="workspaceId" className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm">
              <option value="">Organization-wide</option>
              {workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
            <Button className="w-full" disabled={busy === "ticket-create"}><Send className="h-4 w-4" />Submit request</Button>
          </form>
          <section className="rounded-lg border border-ink/10 bg-white">
            <div className="grid min-h-[34rem] md:grid-cols-[18rem_minmax(0,1fr)]">
              <div className="border-b border-ink/10 p-3 md:border-b-0 md:border-r">
                <h2 className="mb-3 font-semibold">{canManage ? "Service queue" : "My requests"}</h2>
                <div className="space-y-1">
                  {tickets.map((item) => (
                    <button
                      key={item.id}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                        selectedTicket?.id === item.id ? "bg-moss text-white" : "hover:bg-mint"
                      }`}
                      onClick={() => setSelectedTicketId(item.id)}
                    >
                      <span className="block truncate font-medium">{item.subject}</span>
                      <span className="text-xs opacity-70">{label(item.status)} · {label(item.priority)}</span>
                    </button>
                  ))}
                </div>
              </div>
              {selectedTicket ? (
                <div className="space-y-4 p-4">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <Badge>{label(selectedTicket.category)}</Badge>
                      <Badge>{label(selectedTicket.priority)}</Badge>
                      <Badge className="bg-mint">{label(selectedTicket.status)}</Badge>
                    </div>
                    <h3 className="mt-3 text-xl font-semibold">{selectedTicket.subject}</h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-ink/65">{selectedTicket.description}</p>
                    <p className="mt-2 text-xs text-ink/45">Response target: {dateTime(selectedTicket.responseDueAt)}</p>
                    <p className="mt-1 text-xs text-ink/45">
                      First response: {selectedTicket.firstRespondedAt
                        ? `${selectedTicket.firstResponseMinutes ?? 0} minutes`
                        : "Waiting for staff response"}
                    </p>
                  </div>
                  {canManage ? (
                    <div className="grid gap-2 sm:grid-cols-3">
                      <select
                        className="h-10 rounded-md border border-ink/10 bg-white px-2 text-sm"
                        value={selectedTicket.status}
                        onChange={(event) => void updateTicket({ action: "UPDATE", id: selectedTicket.id, status: event.target.value })}
                      >
                        {ticketStatuses.map((item) => <option key={item}>{label(item)}</option>)}
                      </select>
                      <select
                        className="h-10 rounded-md border border-ink/10 bg-white px-2 text-sm"
                        value={selectedTicket.assigneeId ?? ""}
                        onChange={(event) => void updateTicket({ action: "UPDATE", id: selectedTicket.id, assigneeId: event.target.value || null, status: "ASSIGNED" })}
                      >
                        <option value="">Unassigned</option>
                        {users.map((item) => <option key={item.id} value={item.id}>{item.name ?? item.email}</option>)}
                      </select>
                      <select
                        className="h-10 rounded-md border border-ink/10 bg-white px-2 text-sm"
                        value={selectedTicket.priority}
                        onChange={(event) => void updateTicket({ action: "UPDATE", id: selectedTicket.id, priority: event.target.value })}
                      >
                        {["LOW", "NORMAL", "HIGH", "URGENT"].map((item) => <option key={item}>{label(item)}</option>)}
                      </select>
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    {ticketComments.filter((comment) => comment.ticketId === selectedTicket.id).map((comment) => (
                      <div key={comment.id} className={`rounded-md px-3 py-2 text-sm ${comment.internal ? "bg-wheat" : "bg-paper"}`}>
                        <p>{comment.body}</p>
                        <p className="mt-1 text-xs text-ink/40">{comment.internal ? "Internal note · " : ""}{dateTime(comment.createdAt)}</p>
                      </div>
                    ))}
                  </div>
                  <form className="space-y-2" onSubmit={addTicketComment}>
                    <div className="flex gap-2">
                      <Input name="body" placeholder="Write a reply" required />
                      <Button aria-label="Send reply" disabled={busy === "ticket-comment"}><Send className="h-4 w-4" /></Button>
                    </div>
                    {canManage ? <label className="flex items-center gap-2 text-xs text-ink/55"><input name="internal" type="checkbox" />Internal staff note</label> : null}
                  </form>
                </div>
              ) : <p className="p-4 text-sm text-ink/55">No help requests yet.</p>}
            </div>
          </section>
        </div>
      ) : null}

      {!loading && activeTab === "forms" ? (
        <section className="rounded-lg border border-ink/10 bg-white p-5">
          <div className="flex items-start gap-3">
            <FileQuestion className="mt-1 h-5 w-5 text-moss" />
            <div>
              <h2 className="font-semibold">Workspace forms and approval workflows</h2>
              <p className="mt-1 text-sm text-ink/55">
                Build conditional forms, collect signatures and payment references, request approval, export CSV,
                and connect submissions to workspace workflows.
              </p>
            </div>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {workspaces.map((workspace) => (
              <Link
                key={workspace.id}
                className="rounded-md border border-ink/10 p-4 hover:border-moss/40 hover:bg-mint/30"
                href={`/dashboard/workspaces/${workspace.id}#forms`}
              >
                <p className="font-medium">{workspace.name}</p>
                <p className="mt-1 text-xs text-ink/50">Open form builder and responses</p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {!loading && activeTab === "events" ? (
        <div className="space-y-6">
          <section className="grid gap-6 lg:grid-cols-2">
            <form className="space-y-3 rounded-lg border border-ink/10 bg-white p-4" onSubmit={registerForEvent}>
              <h2 className="font-semibold">Register for an event</h2>
              <select name="eventId" required className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">Choose an event</option>
                {events.filter((item) => configurations.some((config) => config.eventId === item.id)).map((item) => (
                  <option key={item.id} value={item.id}>{item.title} · {new Date(item.startsAt).toLocaleDateString("en-GB")}</option>
                ))}
              </select>
              <Input name="displayName" defaultValue={currentUser.name} placeholder="Ticket name" required />
              <Input name="phone" placeholder="Phone" />
              <Input name="invitationCode" placeholder="Invitation code, if required" />
              <Input name="paymentReference" placeholder="Payment reference, if required" />
              <Button className="w-full" disabled={busy === "event-register"}><TicketCheck className="h-4 w-4" />Register</Button>
            </form>
            {canManage ? (
              <form className="space-y-3 rounded-lg border border-ink/10 bg-white p-4" onSubmit={configureEvent}>
                <h2 className="font-semibold">Configure ticketing and check-in</h2>
                <select name="eventId" required className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm">
                  <option value="">Choose an event</option>
                  {events.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <Input name="capacity" min="1" type="number" placeholder="Capacity" />
                  <Input name="invitationCode" placeholder="Invitation code" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input name="paymentAmount" min="0" step="0.01" type="number" placeholder="Fee in GBP" />
                  <Input name="paymentUrl" type="url" placeholder="Payment URL" />
                </div>
                <div className="grid gap-2 text-sm sm:grid-cols-2">
                  {[
                    ["requireApproval", "Approve registrations"],
                    ["badgeEnabled", "Printable badges"],
                    ["certificateEnabled", "Certificates"],
                    ["paymentRequired", "Payment required"]
                  ].map(([name, text]) => <label key={name} className="flex items-center gap-2"><input name={name} type="checkbox" />{text}</label>)}
                </div>
                <Button className="w-full" disabled={busy === "event-configure"}><ShieldCheck className="h-4 w-4" />Save settings</Button>
              </form>
            ) : null}
          </section>
          <section className="rounded-lg border border-ink/10 bg-white">
            <h2 className="border-b border-ink/10 px-4 py-3 font-semibold">{canManage ? "Registration desk" : "My tickets"}</h2>
            <div className="divide-y divide-ink/10">
              {(canManage ? registrations : myRegistrations).map((registration) => {
                const event = events.find((item) => item.id === registration.eventId);
                const config = configurations.find((item) => item.eventId === registration.eventId);
                return (
                  <div key={registration.id} className="flex flex-wrap items-center justify-between gap-4 px-4 py-4">
                    <div>
                      <p className="font-medium">{event?.title ?? "Event"}</p>
                      <p className="text-sm text-ink/55">{registration.displayName} · {registration.ticketCode}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge>{label(registration.status)}</Badge>
                        <Badge>{label(registration.paymentStatus)}</Badge>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a
                        className="inline-flex h-9 items-center gap-2 rounded-md border border-ink/10 px-3 text-sm font-medium hover:bg-mint"
                        href={`/api/event-ticketing/${registration.id}/qr`}
                        target="_blank"
                      >
                        <QrCode className="h-4 w-4" />QR ticket
                      </a>
                      {canManage && registration.status !== "CHECKED_IN" ? (
                        <Button variant="secondary" onClick={() => void eventAction({ action: "CHECK_IN", token: registration.qrToken }, "Guest checked in.")}>
                          <UserRoundCheck className="h-4 w-4" />Check in
                        </Button>
                      ) : null}
                      {canManage ? (
                        <select
                          aria-label="Registration status"
                          className="h-9 rounded-md border border-ink/10 bg-white px-2 text-sm"
                          value={registration.status}
                          onChange={(event) => void eventAction(
                            { action: "STATUS", registrationId: registration.id, status: event.target.value },
                            "Registration status updated."
                          )}
                        >
                          {["REGISTERED", "WAITLISTED", "APPROVED", "CHECKED_IN", "CANCELLED"].map((item) => (
                            <option key={item}>{label(item)}</option>
                          ))}
                        </select>
                      ) : null}
                      {config?.badgeEnabled ? (
                        <a
                          className="inline-flex h-10 items-center gap-2 rounded-md border border-ink/10 bg-white px-4 text-sm font-medium hover:bg-mint/50"
                          href={`/api/event-ticketing/${registration.id}/print?kind=badge`}
                          target="_blank"
                        >
                          <Printer className="h-4 w-4" />Badge
                        </a>
                      ) : null}
                      {config?.certificateEnabled && registration.status === "CHECKED_IN" ? (
                        <a
                          className="inline-flex h-10 items-center gap-2 rounded-md border border-ink/10 bg-white px-4 text-sm font-medium hover:bg-mint/50"
                          href={`/api/event-ticketing/${registration.id}/print?kind=certificate`}
                          target="_blank"
                        >
                          <BadgeCheck className="h-4 w-4" />Certificate
                        </a>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : null}

      {!loading && activeTab === "policies" ? (
        <div className="space-y-6">
          {canManage ? (
            <form className="grid gap-3 rounded-lg border border-ink/10 bg-white p-4 md:grid-cols-2" onSubmit={createPolicy}>
              <h2 className="font-semibold md:col-span-2">Create policy</h2>
              <Input name="title" placeholder="Policy title" required />
              <Input name="summary" placeholder="Short summary" />
              <Textarea className="md:col-span-2" name="content" placeholder="Full policy text" required />
              <Input name="dueDays" min="1" max="365" type="number" defaultValue="14" />
              <select name="workspaceId" className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">Organization-wide</option>
                {workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <Button className="md:col-span-2" disabled={busy === "policy-create"}><Plus className="h-4 w-4" />Create draft</Button>
            </form>
          ) : null}
          <section className="space-y-3">
            {policies.map((policy) => {
              const policyAssignments = assignments.filter((item) => item.policyId === policy.id);
              const mine = policyAssignments.find((item) => item.userId === currentUser.id);
              return (
                <article key={policy.id} className="rounded-lg border border-ink/10 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex gap-2"><Badge>{label(policy.status)}</Badge><Badge>{policy.dueDays} days</Badge></div>
                      <h2 className="mt-2 text-lg font-semibold">{policy.title}</h2>
                      {policy.summary ? <p className="mt-1 text-sm text-ink/55">{policy.summary}</p> : null}
                    </div>
                    {mine?.acknowledgedAt ? <Badge className="bg-mint"><Check className="mr-1 h-3 w-3" />Acknowledged</Badge> : null}
                  </div>
                  <details className="mt-3 rounded-md bg-paper p-3 text-sm">
                    <summary className="cursor-pointer font-medium">Read policy</summary>
                    <p className="mt-3 whitespace-pre-wrap text-ink/70">{policy.content}</p>
                  </details>
                  {canManage ? (
                    <div className="mt-4 space-y-3">
                      <p className="text-sm">
                        {policyAssignments.filter((item) => item.acknowledgedAt).length} acknowledged · {policyAssignments.filter((item) => !item.acknowledgedAt).length} outstanding
                      </p>
                      {policy.status === "DRAFT" ? (
                        <>
                          <div className="grid max-h-40 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
                            {users.map((item) => (
                              <label key={item.id} className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={policyAudience.includes(item.id)}
                                  onChange={(event) => setPolicyAudience((current) =>
                                    event.target.checked ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id)
                                  )}
                                />
                                {item.name ?? item.email}
                              </label>
                            ))}
                          </div>
                          <Button
                            disabled={!policyAudience.length || busy === "policy-action"}
                            onClick={() => void policyAction({ action: "PUBLISH", policyId: policy.id, userIds: policyAudience }, "Policy published and assigned.")}
                          >
                            <Send className="h-4 w-4" />Publish and assign
                          </Button>
                        </>
                      ) : (
                        <Button variant="secondary" onClick={() => void policyAction({ action: "REMIND", policyId: policy.id }, "Outstanding users reminded.")}>
                          <Send className="h-4 w-4" />Remind outstanding
                        </Button>
                      )}
                    </div>
                  ) : !mine?.acknowledgedAt ? (
                    <form
                      className="mt-4 flex max-w-xl gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        const signatureName = new FormData(event.currentTarget).get("signatureName");
                        void policyAction({ action: "ACKNOWLEDGE", policyId: policy.id, signatureName }, "Policy acknowledged.");
                      }}
                    >
                      <Input name="signatureName" placeholder="Type your full name as signature" required />
                      <Button><BadgeCheck className="h-4 w-4" />Acknowledge</Button>
                    </form>
                  ) : null}
                </article>
              );
            })}
          </section>
        </div>
      ) : null}

      {!loading && activeTab === "staff" ? (
        <div className="space-y-6">
          <section className="grid gap-6 lg:grid-cols-2">
            <form className="space-y-3 rounded-lg border border-ink/10 bg-white p-4" onSubmit={submitLeave}>
              <h2 className="font-semibold">Request leave</h2>
              <Input name="leaveType" placeholder="Annual, medical, compassionate..." required />
              <div className="grid grid-cols-2 gap-2">
                <Input name="startsAt" type="datetime-local" required />
                <Input name="endsAt" type="datetime-local" required />
              </div>
              <Textarea name="reason" placeholder="Reason or handover notes" />
              <select name="workspaceId" className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">Organization-wide</option>
                {workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <Button className="w-full" disabled={busy === "leave-create"}><CalendarDays className="h-4 w-4" />Submit leave</Button>
            </form>
            <form className="space-y-3 rounded-lg border border-ink/10 bg-white p-4" onSubmit={saveAvailability}>
              <h2 className="font-semibold">Weekly availability</h2>
              <select name="weekday" className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm">
                {weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}
              </select>
              <select name="status" className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm">
                {["AVAILABLE", "LIMITED", "UNAVAILABLE"].map((item) => <option key={item}>{label(item)}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2"><Input name="startTime" type="time" /><Input name="endTime" type="time" /></div>
              <Input name="note" placeholder="Availability note" />
              <Button className="w-full" disabled={busy === "availability"}><Check className="h-4 w-4" />Save availability</Button>
            </form>
          </section>
          {canManage ? (
            <form className="grid gap-3 rounded-lg border border-ink/10 bg-white p-4 md:grid-cols-2" onSubmit={createDuty}>
              <h2 className="font-semibold md:col-span-2">Schedule a duty or substitution</h2>
              <Input name="title" placeholder="Duty title" required />
              <Input name="role" placeholder="Role or station" />
              <Input name="startsAt" type="datetime-local" required />
              <Input name="endsAt" type="datetime-local" required />
              <select name="assignedToId" required className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">Assign staff member</option>
                {users.map((item) => <option key={item.id} value={item.id}>{item.name ?? item.email}</option>)}
              </select>
              <select name="substituteUserId" className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">No substitute</option>
                {users.map((item) => <option key={item.id} value={item.id}>{item.name ?? item.email}</option>)}
              </select>
              <select name="workspaceId" className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
                <option value="">Organization-wide</option>
                {workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <Input name="notes" placeholder="Instructions" />
              <Button className="md:col-span-2" disabled={busy === "duty-create"}><Plus className="h-4 w-4" />Schedule duty</Button>
            </form>
          ) : null}
          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-ink/10 bg-white">
              <h2 className="border-b border-ink/10 px-4 py-3 font-semibold">Leave requests</h2>
              <div className="divide-y divide-ink/10">
                {leaveRequests.map((item) => (
                  <div key={item.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div><p className="text-sm font-medium">{item.leaveType}</p><p className="text-xs text-ink/50">{dateTime(item.startsAt)} to {dateTime(item.endsAt)}</p></div>
                      <Badge>{label(item.status)}</Badge>
                    </div>
                    {canManage && item.status === "PENDING" ? (
                      <div className="mt-2 flex gap-2">
                        <Button variant="secondary" onClick={() => void run("leave-review", () => api("/api/staff", json("POST", { action: "REVIEW_LEAVE", id: item.id, status: "APPROVED" })), "Leave approved.")}>Approve</Button>
                        <Button variant="secondary" onClick={() => void run("leave-review", () => api("/api/staff", json("POST", { action: "REVIEW_LEAVE", id: item.id, status: "REJECTED" })), "Leave rejected.")}>Reject</Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-ink/10 bg-white">
              <h2 className="border-b border-ink/10 px-4 py-3 font-semibold">Duty calendar</h2>
              <div className="divide-y divide-ink/10">
                {duties.map((item) => (
                  <div key={item.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{item.title}</p>
                        <p className="text-xs text-ink/50">{userName(users, item.assignedToId)} · {dateTime(item.startsAt)}</p>
                        {item.substituteUserId ? <p className="text-xs text-ink/50">Substitute: {userName(users, item.substituteUserId)}</p> : null}
                      </div>
                      <Badge>{label(item.status)}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className="rounded-lg border border-ink/10 bg-white p-4">
            <h2 className="font-semibold">Availability board</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {availability.map((item) => (
                <div key={item.id} className="rounded-md bg-paper p-3 text-sm">
                  <p className="font-medium">{userName(users, item.userId)}</p>
                  <p className="text-ink/55">{weekdays[item.weekday]} · {label(item.status)}</p>
                  <p className="text-xs text-ink/45">{item.startTime ?? "--:--"} to {item.endTime ?? "--:--"}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {!loading && activeTab === "translate" ? (
        <section className="grid gap-6 rounded-lg border border-ink/10 bg-white p-5 lg:grid-cols-2">
          <form className="space-y-3" onSubmit={translate}>
            <div>
              <h2 className="font-semibold">Translate LETW content</h2>
              <p className="mt-1 text-sm text-ink/55">Translate announcements, chat messages, policy text, or document excerpts.</p>
            </div>
            <Textarea className="min-h-56" name="text" placeholder="Paste the text to translate" required />
            <select name="targetLanguage" className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm">
              <option value="yo">Yoruba</option>
              <option value="en">English</option>
              <option value="fr">French</option>
            </select>
            <Button disabled={busy === "translate"}><Languages className="h-4 w-4" />Translate</Button>
          </form>
          <div className="min-h-72 rounded-md bg-paper p-4">
            <p className="text-xs font-medium uppercase text-ink/45">Translation</p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-ink/75">
              {translation || "The translated text will appear here."}
            </p>
          </div>
        </section>
      ) : null}
    </div>
  );
}
