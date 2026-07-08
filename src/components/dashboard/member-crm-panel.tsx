"use client";

import { useMemo, useState } from "react";
import {
  BriefcaseBusiness,
  Building2,
  Download,
  ImagePlus,
  Loader2,
  Save,
  Search,
  ShieldCheck,
  UploadCloud,
  UserRound
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type MemberProfile = {
  phone: string | null;
  alternatePhone: string | null;
  membershipNumber: string | null;
  membershipStatus: string;
  dateOfBirth: string | null;
  gender: string | null;
  maritalStatus: string | null;
  address: string | null;
  city: string | null;
  country: string | null;
  occupation: string | null;
  employer: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  firstVisitAt: string | null;
  salvationAt: string | null;
  baptismAt: string | null;
  membershipStartedAt: string | null;
  weddingAnniversaryAt: string | null;
  organizationPosition: string | null;
  digitalIdLocation: string;
  communicationPreference: string | null;
  ministryInterests: string[];
  skills: string[];
  pastoralCareStatus: string | null;
  adminNotes: string | null;
};

type CrmMember = {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  category: string | null;
  createdAt: string;
  status: string;
  department: { name: string } | null;
  workspaceMemberships: Array<{ role: string; workspace: { id: string; name: string } }>;
  profile: MemberProfile;
  stats: { files: number; tasks: number; activities: number };
};

type ImportSummary = {
  units?: number;
  departments?: number;
  ministries?: number;
  invitations?: number;
  memberProfiles?: number;
  userUpdates?: number;
  skipped?: Array<{ row: number; reason: string }>;
};

const fieldClass = "space-y-1 text-xs font-medium text-ink/60";
const blankProfile: MemberProfile = {
  phone: null,
  alternatePhone: null,
  membershipNumber: null,
  membershipStatus: "ACTIVE",
  dateOfBirth: null,
  gender: null,
  maritalStatus: null,
  address: null,
  city: null,
  country: null,
  occupation: null,
  employer: null,
  emergencyContactName: null,
  emergencyContactPhone: null,
  firstVisitAt: null,
  salvationAt: null,
  baptismAt: null,
  membershipStartedAt: null,
  weddingAnniversaryAt: null,
  organizationPosition: null,
  digitalIdLocation: "LETTW Worldwide",
  communicationPreference: null,
  ministryInterests: [],
  skills: [],
  pastoralCareStatus: null,
  adminNotes: null
};

function dateInput(value: string | null) {
  return value?.slice(0, 10) ?? "";
}

export function MemberCrmPanel({ members: initialMembers }: { members: CrmMember[] }) {
  const [members, setMembers] = useState(initialMembers);
  const [selectedId, setSelectedId] = useState(initialMembers[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<MemberProfile>(initialMembers[0]?.profile ?? blankProfile);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [numbering, setNumbering] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const selected = members.find((member) => member.id === selectedId);
  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) return members;
    return members.filter((member) =>
      [
        member.name,
        member.email,
        member.department?.name,
        member.category,
        member.profile.membershipNumber,
        member.profile.organizationPosition,
        member.profile.digitalIdLocation,
        member.profile.phone,
        member.profile.membershipStatus
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(value)
    );
  }, [members, query]);

  function choose(member: CrmMember) {
    setSelectedId(member.id);
    setDraft(member.profile);
    setMessage("");
  }

  function setField<K extends keyof MemberProfile>(key: K, value: MemberProfile[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setMessage("");
    const response = await fetch(`/api/admin/members/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft)
    });
    const data = (await response.json().catch(() => null)) as { profile?: MemberProfile; error?: string } | null;
    setSaving(false);
    if (!response.ok || !data?.profile) {
      setMessage(data?.error ?? "Member profile could not be saved.");
      return;
    }
    const profile = {
      ...data.profile,
      dateOfBirth: dateInput(data.profile.dateOfBirth),
      firstVisitAt: dateInput(data.profile.firstVisitAt),
      salvationAt: dateInput(data.profile.salvationAt),
      baptismAt: dateInput(data.profile.baptismAt),
      membershipStartedAt: dateInput(data.profile.membershipStartedAt),
      weddingAnniversaryAt: dateInput(data.profile.weddingAnniversaryAt)
    };
    setDraft(profile);
    setMembers((current) => current.map((member) => (member.id === selected.id ? { ...member, profile } : member)));
    setMessage("Member profile saved.");
  }

  function summarizeImport(summary: ImportSummary) {
    const parts = [
      summary.units ? `${summary.units} units` : null,
      summary.departments ? `${summary.departments} departments/categories` : null,
      summary.ministries ? `${summary.ministries} ministries` : null,
      summary.invitations ? `${summary.invitations} invitations` : null,
      summary.memberProfiles ? `${summary.memberProfiles} member profiles` : null,
      summary.userUpdates ? `${summary.userUpdates} user updates` : null
    ].filter(Boolean);
    const skipped = summary.skipped?.length ? ` ${summary.skipped.length} row(s) need attention.` : "";
    return `${parts.length ? parts.join(", ") : "No changes were needed."}.${skipped}`;
  }

  async function applyStarterData() {
    setImporting(true);
    setImportMessage("");
    const response = await fetch("/api/admin/organization-import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "BOOTSTRAP" })
    });
    const data = (await response.json().catch(() => null)) as { summary?: ImportSummary; error?: string } | null;
    setImporting(false);
    if (!response.ok || !data?.summary) {
      setImportMessage(data?.error ?? "Starter data could not be applied.");
      return;
    }
    setImportMessage(`Starter data applied: ${summarizeImport(data.summary)}`);
  }

  async function importCsv(file: File | null) {
    if (!file) return;
    setImporting(true);
    setImportMessage("");
    const formData = new FormData();
    formData.set("file", file);
    const response = await fetch("/api/admin/organization-import", { method: "POST", body: formData });
    const data = (await response.json().catch(() => null)) as { summary?: ImportSummary; error?: string } | null;
    setImporting(false);
    if (!response.ok || !data?.summary) {
      setImportMessage(data?.error ?? "Organization import could not be completed.");
      return;
    }
    setImportMessage(`Import complete: ${summarizeImport(data.summary)}`);
    setTimeout(() => window.location.reload(), 900);
  }

  async function generateMemberNumbers() {
    setNumbering(true);
    setImportMessage("");
    const response = await fetch("/api/admin/member-numbers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ includeUnitCode: true })
    });
    const data = (await response.json().catch(() => null)) as { assigned?: number; pending?: number; error?: string } | null;
    setNumbering(false);

    if (!response.ok) {
      setImportMessage(data?.error ?? "Member numbers could not be generated.");
      return;
    }

    setImportMessage(`${data?.assigned ?? 0} member number(s) generated. Reloading member CRM...`);
    setTimeout(() => window.location.reload(), 900);
  }

  async function uploadSelectedPhoto(file: File | null) {
    if (!file || !selected) return;
    setPhotoUploading(true);
    setMessage("");
    const formData = new FormData();
    formData.set("photo", file);
    const response = await fetch(`/api/admin/members/${selected.id}/photo`, { method: "POST", body: formData });
    const data = (await response.json().catch(() => null)) as { imageUrl?: string; error?: string } | null;
    setPhotoUploading(false);
    if (!response.ok || !data?.imageUrl) {
      setMessage(data?.error ?? "Member photo could not be uploaded.");
      return;
    }
    setMembers((current) =>
      current.map((member) => (member.id === selected.id ? { ...member, image: data.imageUrl ?? member.image } : member))
    );
    setMessage("Member photo uploaded.");
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-ink/10 bg-white p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Building2 className="h-4 w-4 text-moss" />
              Organization data setup
            </p>
            <p className="mt-1 text-xs text-ink/55">
              Load LETW branches, departments, ministries, invitations, positions, membership numbers, and profile links.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <a
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-ink/10 bg-white px-3 text-sm font-medium hover:bg-mint/40"
              href="/api/admin/organization-import"
            >
              <Download className="h-4 w-4" />
              Template
            </a>
            <Button variant="secondary" onClick={applyStarterData} disabled={importing}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Building2 className="h-4 w-4" />}
              Apply LETW starter data
            </Button>
            <Button variant="secondary" onClick={generateMemberNumbers} disabled={numbering}>
              {numbering ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              Generate member numbers
            </Button>
            <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md bg-ink px-3 text-sm font-medium text-white hover:bg-ink/90">
              <UploadCloud className="h-4 w-4" />
              Import CSV
              <input
                className="sr-only"
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => void importCsv(event.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </div>
        {importMessage ? <p className="mt-3 rounded-md bg-paper px-3 py-2 text-sm text-ink/70">{importMessage}</p> : null}
      </section>

      <div className="grid gap-5 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <section className="overflow-hidden rounded-lg border border-ink/10 bg-white">
        <div className="border-b border-ink/10 p-4">
          <div className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-moss" />
            <h2 className="text-sm font-semibold">Member directory</h2>
            <Badge>{members.length}</Badge>
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" />
            <Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search members" />
          </div>
        </div>
        <div className="max-h-[68rem] divide-y divide-ink/10 overflow-y-auto">
          {filtered.map((member) => (
            <button
              key={member.id}
              className={`w-full px-4 py-3 text-left transition hover:bg-mint/35 ${
                member.id === selectedId ? "bg-mint/50" : ""
              }`}
              onClick={() => choose(member)}
              type="button"
            >
              <p className="truncate text-sm font-semibold text-ink">{member.name ?? member.email ?? "Unnamed member"}</p>
              <p className="truncate text-xs text-ink/50">{member.email}</p>
              <div className="mt-2 flex flex-wrap gap-1">
                <Badge>{member.profile.membershipStatus.toLowerCase()}</Badge>
                {member.department ? <Badge className="bg-paper">{member.department.name}</Badge> : null}
              </div>
            </button>
          ))}
        </div>
        </section>

        {selected ? (
          <section className="rounded-lg border border-ink/10 bg-white">
          <div className="flex flex-col gap-3 border-b border-ink/10 p-5 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 gap-4">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-ink/10 bg-paper">
                {selected.image ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- Imported profile images can be approved external URLs. */
                  <img alt={selected.name ?? "Member photo"} className="h-full w-full object-cover" src={selected.image} />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-ink/35">
                    <UserRound className="h-8 w-8" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="flex items-center gap-2 text-xs font-medium text-moss">
                  <ShieldCheck className="h-4 w-4" />
                  Admin-only Member 360
                </p>
                <h2 className="mt-1 truncate text-2xl font-semibold text-ink">{selected.name ?? selected.email}</h2>
                <p className="truncate text-sm text-ink/55">{selected.email}</p>
                <label className="mt-3 inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-md border border-ink/10 bg-paper px-3 text-xs font-medium hover:bg-mint/40">
                  {photoUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                  Upload photo
                  <input
                    className="sr-only"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(event) => void uploadSelectedPhoto(event.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
            </div>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save profile
            </Button>
          </div>

          <div className="grid gap-3 border-b border-ink/10 bg-paper p-4 sm:grid-cols-3">
            <div><p className="text-xl font-semibold">{selected.workspaceMemberships.length}</p><p className="text-xs text-ink/50">Workspaces</p></div>
            <div><p className="text-xl font-semibold">{selected.stats.files}</p><p className="text-xs text-ink/50">Files uploaded</p></div>
            <div><p className="text-xl font-semibold">{selected.stats.tasks}</p><p className="text-xs text-ink/50">Task assignments</p></div>
          </div>

          {message ? <p className="border-b border-ink/10 bg-mint px-5 py-2 text-sm text-ink">{message}</p> : null}
          <div className="space-y-6 p-5">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold"><UserRound className="h-4 w-4 text-moss" />Identity and contact</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                <label className={fieldClass}>Membership number<Input value={draft.membershipNumber ?? ""} onChange={(e) => setField("membershipNumber", e.target.value || null)} /></label>
                <label className={fieldClass}>Membership status<Input value={draft.membershipStatus} onChange={(e) => setField("membershipStatus", e.target.value)} /></label>
                <label className={fieldClass}>LETTW position<Input value={draft.organizationPosition ?? ""} onChange={(e) => setField("organizationPosition", e.target.value || null)} placeholder="Pastor, leader, worker, member..." /></label>
                <label className={fieldClass}>Digital ID location<Input value={draft.digitalIdLocation} onChange={(e) => setField("digitalIdLocation", e.target.value)} placeholder="Branch, city, region, or LETTW Worldwide" /></label>
                <label className={fieldClass}>Date of birth<Input type="date" value={dateInput(draft.dateOfBirth)} onChange={(e) => setField("dateOfBirth", e.target.value || null)} /></label>
                <label className={fieldClass}>Phone<Input value={draft.phone ?? ""} onChange={(e) => setField("phone", e.target.value || null)} /></label>
                <label className={fieldClass}>Alternate phone<Input value={draft.alternatePhone ?? ""} onChange={(e) => setField("alternatePhone", e.target.value || null)} /></label>
                <label className={fieldClass}>Communication preference<Input value={draft.communicationPreference ?? ""} onChange={(e) => setField("communicationPreference", e.target.value || null)} /></label>
                <label className={fieldClass}>Gender<Input value={draft.gender ?? ""} onChange={(e) => setField("gender", e.target.value || null)} /></label>
                <label className={fieldClass}>Marital status<Input value={draft.maritalStatus ?? ""} onChange={(e) => setField("maritalStatus", e.target.value || null)} /></label>
                <label className={fieldClass}>City<Input value={draft.city ?? ""} onChange={(e) => setField("city", e.target.value || null)} /></label>
                <label className={fieldClass}>Country<Input value={draft.country ?? ""} onChange={(e) => setField("country", e.target.value || null)} /></label>
                <label className={`${fieldClass} md:col-span-2`}>Address<Input value={draft.address ?? ""} onChange={(e) => setField("address", e.target.value || null)} /></label>
              </div>
            </div>

            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold"><BriefcaseBusiness className="h-4 w-4 text-moss" />Work, care and milestones</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                <label className={fieldClass}>Occupation<Input value={draft.occupation ?? ""} onChange={(e) => setField("occupation", e.target.value || null)} /></label>
                <label className={fieldClass}>Employer<Input value={draft.employer ?? ""} onChange={(e) => setField("employer", e.target.value || null)} /></label>
                <label className={fieldClass}>Pastoral care status<Input value={draft.pastoralCareStatus ?? ""} onChange={(e) => setField("pastoralCareStatus", e.target.value || null)} /></label>
                <label className={fieldClass}>Emergency contact<Input value={draft.emergencyContactName ?? ""} onChange={(e) => setField("emergencyContactName", e.target.value || null)} /></label>
                <label className={fieldClass}>Emergency phone<Input value={draft.emergencyContactPhone ?? ""} onChange={(e) => setField("emergencyContactPhone", e.target.value || null)} /></label>
                <label className={fieldClass}>First visit<Input type="date" value={dateInput(draft.firstVisitAt)} onChange={(e) => setField("firstVisitAt", e.target.value || null)} /></label>
                <label className={fieldClass}>Salvation date<Input type="date" value={dateInput(draft.salvationAt)} onChange={(e) => setField("salvationAt", e.target.value || null)} /></label>
                <label className={fieldClass}>Baptism date<Input type="date" value={dateInput(draft.baptismAt)} onChange={(e) => setField("baptismAt", e.target.value || null)} /></label>
                <label className={fieldClass}>Membership start<Input type="date" value={dateInput(draft.membershipStartedAt)} onChange={(e) => setField("membershipStartedAt", e.target.value || null)} /></label>
                <label className={fieldClass}>Wedding anniversary<Input type="date" value={dateInput(draft.weddingAnniversaryAt)} onChange={(e) => setField("weddingAnniversaryAt", e.target.value || null)} /></label>
                <label className={`${fieldClass} md:col-span-2`}>Ministry interests<Input value={draft.ministryInterests.join(", ")} onChange={(e) => setField("ministryInterests", e.target.value.split(",").map((v) => v.trim()).filter(Boolean))} /></label>
                <label className={`${fieldClass} md:col-span-2`}>Skills<Input value={draft.skills.join(", ")} onChange={(e) => setField("skills", e.target.value.split(",").map((v) => v.trim()).filter(Boolean))} /></label>
              </div>
            </div>

            <label className={fieldClass}>
              Admin notes
              <Textarea className="min-h-36" value={draft.adminNotes ?? ""} onChange={(e) => setField("adminNotes", e.target.value || null)} />
              <span className="block font-normal text-ink/40">Restricted to administrators and excluded from AI search.</span>
            </label>

            <div>
              <h3 className="text-sm font-semibold">Workspace roles</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {selected.workspaceMemberships.map((membership) => (
                  <Badge key={`${membership.workspace.id}-${membership.role}`}>
                    {membership.workspace.name}: {membership.role.toLowerCase()}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
          </section>
        ) : (
          <section className="rounded-lg border border-ink/10 bg-white p-8 text-sm text-ink/55">No member selected.</section>
        )}
      </div>
    </div>
  );
}
