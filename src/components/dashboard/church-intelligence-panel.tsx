"use client";

import type { LucideIcon } from "lucide-react";
import { BadgeCheck, CalendarCheck, Languages, Loader2, MapPinned, Plus, Store, UsersRound } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { localeOptions } from "@/lib/i18n";

type UserOption = { id: string; name?: string | null; email?: string | null };
type UnitOption = { id: string; name: string; type: string };
type MinistryOption = { id: string; name: string };
type ResourceOption = { id: string; name: string; category: string };
type WorkspaceOption = { id: string; name: string };

type IntelligenceData = {
  opportunities: Array<{ id: string; title: string; role: string; status: string }>;
  matches: Array<{ id: string; opportunityId: string; userId: string; score: number; reasons: string[] }>;
  launchPlans: Array<{ id: string; name: string; status: string; city?: string | null; country?: string | null }>;
  launchSteps: Array<{ id: string; planId: string; title: string; category: string; status: string }>;
  translations: Array<{ id: string; title: string; targetLanguage: string; translatedText: string; status: string; createdAt: string }>;
  marketplaceListings: Array<{ id: string; title: string; category: string; quantity: number; status: string; location?: string | null }>;
  marketplaceRequests: Array<{ id: string; title: string; category: string; quantity: number; status: string }>;
  rosterPlans: Array<{ id: string; title: string; status: string; startsAt: string; endsAt: string }>;
  rosterAssignments: Array<{ id: string; rosterPlanId: string; userId: string; role: string; dutyDate: string }>;
  leadershipCandidates: Array<{ id: string; userId: string; score: number; status: string; recommendation?: string | null }>;
  users: UserOption[];
  ministries: MinistryOption[];
  units: UnitOption[];
  resources: ResourceOption[];
  workspaces: WorkspaceOption[];
};

type Mode = "VOLUNTEER_OPPORTUNITY" | "BRANCH_PLAYBOOK" | "TRANSLATION" | "MARKETPLACE_LISTING" | "MARKETPLACE_REQUEST" | "ROSTER_PLAN" | "GENERATE_LEADERSHIP";

const emptyData: IntelligenceData = {
  opportunities: [],
  matches: [],
  launchPlans: [],
  launchSteps: [],
  translations: [],
  marketplaceListings: [],
  marketplaceRequests: [],
  rosterPlans: [],
  rosterAssignments: [],
  leadershipCandidates: [],
  users: [],
  ministries: [],
  units: [],
  resources: [],
  workspaces: []
};

const modes: Array<[Mode, string]> = [
  ["VOLUNTEER_OPPORTUNITY", "Volunteer matching"],
  ["BRANCH_PLAYBOOK", "Branch playbook"],
  ["TRANSLATION", "Translation center"],
  ["MARKETPLACE_LISTING", "Share resource"],
  ["MARKETPLACE_REQUEST", "Request resource"],
  ["ROSTER_PLAN", "Smart roster"],
  ["GENERATE_LEADERSHIP", "Leadership pipeline"]
];

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function ChurchIntelligencePanel() {
  const [data, setData] = useState<IntelligenceData>(emptyData);
  const [mode, setMode] = useState<Mode>("VOLUNTEER_OPPORTUNITY");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const userName = useMemo(() => new Map(data.users.map((user) => [user.id, user.name ?? user.email ?? "Member"])), [data.users]);
  const metrics: Array<[string, number, LucideIcon]> = [
    ["Open opportunities", data.opportunities.filter((item) => item.status === "OPEN").length, UsersRound],
    ["Launch playbooks", data.launchPlans.length, MapPinned],
    ["Translations", data.translations.length, Languages],
    ["Marketplace", data.marketplaceListings.length + data.marketplaceRequests.length, Store],
    ["Roster plans", data.rosterPlans.length, CalendarCheck],
    ["Leadership candidates", data.leadershipCandidates.length, BadgeCheck]
  ];

  async function load() {
    setLoading(true);
    const response = await fetch("/api/church/intelligence");
    const body = (await response.json().catch(() => null)) as (IntelligenceData & { error?: string }) | null;
    setLoading(false);
    if (!response.ok || !body) {
      setError(body?.error ?? "Church intelligence could not be loaded.");
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
    for (const key of ["ministryId", "organizationUnitId", "workspaceId", "leaderId", "resourceId", "listingId"]) {
      if (payload[key] === "") payload[key] = null;
    }
    for (const key of ["targetLaunchAt", "availableFrom", "neededBy", "startsAt", "endsAt"]) {
      if (payload[key]) payload[key] = new Date(String(payload[key])).toISOString();
      else delete payload[key];
    }
    if (mode === "GENERATE_LEADERSHIP") {
      payload.entity = "GENERATE_LEADERSHIP";
    }
    const response = await fetch("/api/church/intelligence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy("");
    if (!response.ok) {
      setError(body?.error ?? "The request could not be completed.");
      return;
    }
    form.reset();
    setNotice(`${label(mode)} completed.`);
    await load();
  }

  async function update(entity: string, id: string, status: string) {
    const response = await fetch("/api/church/intelligence", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity, id, status })
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok) {
      setError(body?.error ?? "Update failed.");
      return;
    }
    setNotice("Updated.");
    await load();
  }

  return (
    <div className="space-y-5">
      {notice ? <p className="rounded-md bg-mint px-4 py-3 text-sm text-moss">{notice}</p> : null}
      {error ? <p className="rounded-md bg-clay/10 px-4 py-3 text-sm text-clay">{error}</p> : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map(([title, value, Icon]) => (
          <div className="rounded-lg border border-ink/10 bg-white p-4" key={title}>
            <Icon className="h-5 w-5 text-moss" />
            <p className="mt-3 text-2xl font-semibold">{value}</p>
            <p className="text-sm text-ink/55">{title}</p>
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-ink/10 bg-white">
        <div className="flex gap-1 overflow-x-auto border-b border-ink/10 p-2">
          {modes.map(([id, title]) => (
            <button className={`shrink-0 rounded-md px-3 py-2 text-sm font-medium ${mode === id ? "bg-moss text-white" : "hover:bg-mint/50"}`} key={id} type="button" onClick={() => setMode(id)}>
              {title}
            </button>
          ))}
        </div>
        <form className="grid gap-3 p-4 md:grid-cols-2" onSubmit={create}>
          {mode === "VOLUNTEER_OPPORTUNITY" ? (
            <>
              <Input name="title" placeholder="Opportunity title" required />
              <Input name="role" placeholder="Role, e.g. choir lead, media worker" required />
              <Input name="requiredSkills" placeholder="Skills: camera, worship, counselling" />
              <Input name="spiritualGifts" placeholder="Spiritual gifts" />
              <Input name="languages" placeholder="Languages: en, yo, fr, ha, ig" />
              <Input name="interests" placeholder="Interests: youth, prayer, media" />
              <select className="h-10 rounded-md border border-ink/10 px-3 text-sm" name="ministryId"><option value="">No ministry</option>{data.ministries.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <select className="h-10 rounded-md border border-ink/10 px-3 text-sm" name="organizationUnitId"><option value="">No branch</option>{data.units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <Input className="md:col-span-2" name="location" placeholder="Location" />
            </>
          ) : null}
          {mode === "BRANCH_PLAYBOOK" ? (
            <>
              <Input name="name" placeholder="Branch launch name" required />
              <Input name="country" placeholder="Country" />
              <Input name="city" placeholder="City" />
              <Input name="targetLaunchAt" type="datetime-local" />
              <Input name="budgetAmount" type="number" min="0" placeholder="Budget amount" />
              <Input name="budgetCurrency" defaultValue="GBP" maxLength={3} />
              <select className="h-10 rounded-md border border-ink/10 px-3 text-sm" name="leaderId"><option value="">No leader yet</option>{data.users.map((item) => <option key={item.id} value={item.id}>{item.name ?? item.email}</option>)}</select>
              <select className="h-10 rounded-md border border-ink/10 px-3 text-sm" name="organizationUnitId"><option value="">No unit yet</option>{data.units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            </>
          ) : null}
          {mode === "TRANSLATION" ? (
            <>
              <Input name="title" placeholder="Translation title" required />
              <select className="h-10 rounded-md border border-ink/10 px-3 text-sm" name="sourceType">
                {["ANNOUNCEMENT", "SERMON", "CHAT", "POLICY", "TRAINING", "DOCUMENT", "OTHER"].map((item) => <option key={item}>{item}</option>)}
              </select>
              <select className="h-10 rounded-md border border-ink/10 px-3 text-sm" name="sourceLanguage" defaultValue="en">{localeOptions.map((item) => <option key={item.value} value={item.value}>{item.englishName}</option>)}</select>
              <select className="h-10 rounded-md border border-ink/10 px-3 text-sm" name="targetLanguage" defaultValue="yo">{localeOptions.map((item) => <option key={item.value} value={item.value}>{item.englishName}</option>)}</select>
              <Textarea className="md:col-span-2" name="originalText" placeholder="Text to translate" required />
            </>
          ) : null}
          {mode === "MARKETPLACE_LISTING" ? (
            <>
              <Input name="title" placeholder="Resource to share" required />
              <Input name="category" placeholder="Camera, bus, keyboard, worker..." required />
              <Input name="quantity" type="number" min="1" defaultValue="1" />
              <Input name="location" placeholder="Location" />
              <select className="h-10 rounded-md border border-ink/10 px-3 text-sm" name="resourceId"><option value="">No linked resource</option>{data.resources.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <select className="h-10 rounded-md border border-ink/10 px-3 text-sm" name="organizationUnitId"><option value="">No branch</option>{data.units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <Textarea className="md:col-span-2" name="description" placeholder="Description and sharing conditions" />
            </>
          ) : null}
          {mode === "MARKETPLACE_REQUEST" ? (
            <>
              <Input name="title" placeholder="Requested resource" required />
              <Input name="category" placeholder="Category" required />
              <Input name="quantity" type="number" min="1" defaultValue="1" />
              <Input name="neededBy" type="datetime-local" />
              <select className="h-10 rounded-md border border-ink/10 px-3 text-sm" name="organizationUnitId"><option value="">No branch</option>{data.units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <select className="h-10 rounded-md border border-ink/10 px-3 text-sm" name="listingId"><option value="">No listing</option>{data.marketplaceListings.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
              <Textarea className="md:col-span-2" name="notes" placeholder="Why it is needed" />
            </>
          ) : null}
          {mode === "ROSTER_PLAN" ? (
            <>
              <Input name="title" placeholder="Roster title" required />
              <Input name="startsAt" type="datetime-local" required />
              <Input name="endsAt" type="datetime-local" required />
              <Input name="roles" placeholder="Choir, Ushers, Media, Protocol, Children" />
              <select className="h-10 rounded-md border border-ink/10 px-3 text-sm" name="ministryId"><option value="">No ministry</option>{data.ministries.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <select className="h-10 rounded-md border border-ink/10 px-3 text-sm" name="organizationUnitId"><option value="">No branch</option>{data.units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
            </>
          ) : null}
          {mode === "GENERATE_LEADERSHIP" ? (
            <>
              <select className="h-10 rounded-md border border-ink/10 px-3 text-sm" name="organizationUnitId"><option value="">All branches</option>{data.units.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <select className="h-10 rounded-md border border-ink/10 px-3 text-sm" name="ministryId"><option value="">All ministries</option>{data.ministries.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <p className="rounded-md bg-paper p-3 text-sm text-ink/55 md:col-span-2">This scans attendance, service history, skills, interests and existing roles to identify leadership candidates.</p>
            </>
          ) : null}
          <Button className="md:col-span-2" disabled={Boolean(busy)} type="submit">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Run {label(mode)}
          </Button>
        </form>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <Panel title="Volunteer matches" icon={<UsersRound className="h-4 w-4" />}>
          {data.opportunities.map((item) => (
            <div className="border-b border-ink/10 py-3" key={item.id}>
              <p className="font-medium">{item.title}</p>
              <p className="text-xs text-ink/50">{item.role} - {label(item.status)}</p>
              <div className="mt-2 space-y-1">
                {data.matches.filter((match) => match.opportunityId === item.id).slice(0, 5).map((match) => (
                  <p className="rounded-md bg-paper px-3 py-2 text-xs" key={match.id}>{userName.get(match.userId)} - {match.score}% - {match.reasons?.join(", ")}</p>
                ))}
              </div>
            </div>
          ))}
        </Panel>

        <Panel title="Branch launch playbooks" icon={<MapPinned className="h-4 w-4" />}>
          {data.launchPlans.map((plan) => (
            <div className="border-b border-ink/10 py-3" key={plan.id}>
              <p className="font-medium">{plan.name}</p>
              <p className="text-xs text-ink/50">{plan.city || "City pending"} {plan.country || ""} - {label(plan.status)}</p>
              <div className="mt-2 grid gap-2">
                {data.launchSteps.filter((step) => step.planId === plan.id).map((step) => (
                  <button className="rounded-md border border-ink/10 px-3 py-2 text-left text-xs hover:bg-mint/50" key={step.id} type="button" onClick={() => void update("BRANCH_STEP", step.id, step.status === "DONE" ? "IN_PROGRESS" : "DONE")}>
                    {step.category}: {step.title} - {label(step.status)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </Panel>

        <Panel title="Global translation center" icon={<Languages className="h-4 w-4" />}>
          {data.translations.map((item) => (
            <div className="border-b border-ink/10 py-3" key={item.id}>
              <p className="font-medium">{item.title}</p>
              <p className="text-xs text-ink/50">Target: {item.targetLanguage} - {label(item.status)}</p>
              <p className="mt-2 line-clamp-3 text-sm text-ink/65">{item.translatedText}</p>
            </div>
          ))}
        </Panel>

        <Panel title="Resource marketplace" icon={<Store className="h-4 w-4" />}>
          {data.marketplaceListings.map((item) => (
            <div className="border-b border-ink/10 py-3" key={item.id}>
              <p className="font-medium">{item.title}</p>
              <p className="text-xs text-ink/50">{item.category} - qty {item.quantity} - {label(item.status)}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {["AVAILABLE", "RESERVED", "SHARED", "ARCHIVED"].map((status) => <SmallAction key={status} onClick={() => void update("MARKETPLACE_LISTING", item.id, status)}>{label(status)}</SmallAction>)}
              </div>
            </div>
          ))}
          {data.marketplaceRequests.map((item) => (
            <div className="border-b border-ink/10 py-3" key={item.id}>
              <p className="font-medium">{item.title}</p>
              <p className="text-xs text-ink/50">{item.category} request - qty {item.quantity} - {label(item.status)}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {["OFFERED", "FULFILLED", "CANCELLED"].map((status) => <SmallAction key={status} onClick={() => void update("MARKETPLACE_REQUEST", item.id, status)}>{label(status)}</SmallAction>)}
              </div>
            </div>
          ))}
        </Panel>

        <Panel title="Smart rostering" icon={<CalendarCheck className="h-4 w-4" />}>
          {data.rosterPlans.map((plan) => (
            <div className="border-b border-ink/10 py-3" key={plan.id}>
              <p className="font-medium">{plan.title}</p>
              <p className="text-xs text-ink/50">{new Date(plan.startsAt).toLocaleString("en-GB")} - {label(plan.status)}</p>
              <div className="mt-2 grid gap-1">
                {data.rosterAssignments.filter((item) => item.rosterPlanId === plan.id).map((item) => (
                  <p className="rounded-md bg-paper px-3 py-2 text-xs" key={item.id}>{item.role}: {userName.get(item.userId)}</p>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                {["PUBLISHED", "ARCHIVED"].map((status) => <SmallAction key={status} onClick={() => void update("ROSTER_PLAN", plan.id, status)}>{label(status)}</SmallAction>)}
              </div>
            </div>
          ))}
        </Panel>

        <Panel title="Leadership pipeline" icon={<BadgeCheck className="h-4 w-4" />}>
          {data.leadershipCandidates.map((item) => (
            <div className="border-b border-ink/10 py-3" key={item.id}>
              <p className="font-medium">{userName.get(item.userId)} <Badge>{item.score}%</Badge></p>
              <p className="text-xs text-ink/50">{label(item.status)} - {item.recommendation}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {["TRAINING", "READY", "APPOINTED", "NOT_READY"].map((status) => <SmallAction key={status} onClick={() => void update("LEADERSHIP_CANDIDATE", item.id, status)}>{label(status)}</SmallAction>)}
              </div>
            </div>
          ))}
        </Panel>
      </section>
    </div>
  );
}

function Panel({ children, icon, title }: { children: React.ReactNode; icon: React.ReactNode; title: string }) {
  return (
    <section className="rounded-lg border border-ink/10 bg-white">
      <h2 className="flex items-center gap-2 border-b border-ink/10 px-4 py-3 font-semibold">{icon}{title}</h2>
      <div className="max-h-[32rem] overflow-y-auto px-4">
        {children}
      </div>
    </section>
  );
}

function SmallAction({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button className="rounded-md border border-ink/10 px-2 py-1 text-xs hover:bg-mint/50" type="button" onClick={onClick}>
      {children}
    </button>
  );
}
