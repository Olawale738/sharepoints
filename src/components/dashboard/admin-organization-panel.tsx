"use client";

import { FormEvent, useState } from "react";
import { Building2, KeyRound, Loader2, Plus, Save, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Department = {
  id: string;
  name: string;
  kind: "DEPARTMENT" | "MINISTRY_UNIT" | "CATEGORY" | string;
  description?: string | null;
  _count?: {
    members: number;
    workspaceAccess: number;
  };
};

type AdminOrgUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  departmentId?: string | null;
  category?: string | null;
  forcePasswordReset?: boolean;
  singleActiveSession?: boolean;
  isAdmin: boolean;
};

type AdminOrganizationPanelProps = {
  users: AdminOrgUser[];
  departments: Department[];
};

function kindLabel(kind: string) {
  return kind.toLowerCase().replaceAll("_", " ");
}

export function AdminOrganizationPanel({ users: initialUsers, departments: initialDepartments }: AdminOrganizationPanelProps) {
  const [users, setUsers] = useState(initialUsers);
  const [departments, setDepartments] = useState(initialDepartments);
  const [busyUserId, setBusyUserId] = useState("");
  const [isCreatingDepartment, setIsCreatingDepartment] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  async function createDepartment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("");
    setIsCreatingDepartment(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch("/api/admin/departments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(formData.get("name")),
        kind: String(formData.get("kind")),
        description: String(formData.get("description") ?? "")
      })
    });
    setIsCreatingDepartment(false);

    const data = (await response.json().catch(() => null)) as { department?: Department; error?: string } | null;

    if (!response.ok || !data?.department) {
      setError(data?.error ?? "Department could not be created.");
      return;
    }

    setDepartments((current) => [...current, data.department as Department].sort((first, second) => first.name.localeCompare(second.name)));
    setStatus(`${data.department.name} created.`);
    form.reset();
  }

  async function updateUser(userId: string, body: Partial<Pick<AdminOrgUser, "departmentId" | "category" | "forcePasswordReset" | "singleActiveSession">>) {
    setError("");
    setStatus("");
    setBusyUserId(userId);
    const response = await fetch(`/api/admin/users/${userId}/organization`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    setBusyUserId("");

    const data = (await response.json().catch(() => null)) as { user?: AdminOrgUser; error?: string } | null;

    if (!response.ok || !data?.user) {
      setError(data?.error ?? "User organization settings could not be saved.");
      return;
    }

    setUsers((current) =>
      current.map((user) =>
        user.id === userId
          ? {
              ...user,
              departmentId: data.user?.departmentId ?? null,
              category: data.user?.category ?? null,
              forcePasswordReset: Boolean(data.user?.forcePasswordReset),
              singleActiveSession: Boolean(data.user?.singleActiveSession)
            }
          : user
      )
    );
    setStatus(`${data.user.email ?? "User"} updated.`);
  }

  async function revokeSessions(user: AdminOrgUser) {
    if (!window.confirm(`Revoke all sessions for ${user.email ?? user.name ?? "this user"}?`)) {
      return;
    }

    setError("");
    setStatus("");
    setBusyUserId(user.id);
    const response = await fetch(`/api/admin/users/${user.id}/sessions`, {
      method: "DELETE"
    });
    setBusyUserId("");

    const data = (await response.json().catch(() => null)) as { revoked?: boolean; error?: string } | null;

    if (!response.ok || !data?.revoked) {
      setError(data?.error ?? "Sessions could not be revoked.");
      return;
    }

    setStatus(`${user.email ?? "User"} sessions revoked.`);
  }

  return (
    <section className="rounded-lg border border-ink/10 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-moss" />
          <h2 className="text-sm font-semibold">Departments, categories, and sessions</h2>
        </div>
        <Badge>{departments.length} groups</Badge>
      </div>
      {error ? <p className="border-b border-ink/10 bg-clay/10 px-4 py-2 text-sm text-clay">{error}</p> : null}
      {status ? <p className="border-b border-ink/10 bg-mint px-4 py-2 text-sm text-ink">{status}</p> : null}

      <div className="grid gap-4 p-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="space-y-4">
          <form className="space-y-3 rounded-md border border-ink/10 bg-paper p-3" onSubmit={createDepartment}>
            <Input name="name" placeholder="Department or ministry name" required />
            <select
              className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
              name="kind"
              defaultValue="DEPARTMENT"
            >
              <option value="DEPARTMENT">Department</option>
              <option value="MINISTRY_UNIT">Ministry unit</option>
              <option value="CATEGORY">Category</option>
            </select>
            <Textarea name="description" placeholder="Optional description" rows={2} />
            <Button type="submit" disabled={isCreatingDepartment}>
              {isCreatingDepartment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add group
            </Button>
          </form>

          <div className="space-y-2">
            {departments.length === 0 ? <p className="rounded-md bg-paper px-3 py-4 text-sm text-ink/55">No departments yet.</p> : null}
            {departments.map((department) => (
              <div key={department.id} className="rounded-md border border-ink/10 bg-paper px-3 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{department.name}</p>
                    <p className="text-xs text-ink/45">{kindLabel(department.kind)}</p>
                  </div>
                  <Badge className="bg-white">{department._count?.members ?? 0} users</Badge>
                </div>
                {department.description ? <p className="mt-2 text-xs text-ink/55">{department.description}</p> : null}
              </div>
            ))}
          </div>
        </div>

        <div className="divide-y divide-ink/10 rounded-md border border-ink/10">
          {users.map((user) => {
            const isBusy = busyUserId === user.id;

            return (
              <div key={user.id} className="bg-white px-3 py-3">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{user.name ?? user.email ?? "Unnamed user"}</p>
                    <p className="truncate text-xs text-ink/50">{user.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {user.isAdmin ? <Badge className="bg-moss text-white">admin</Badge> : null}
                    {user.forcePasswordReset ? <Badge className="bg-wheat">reset required</Badge> : null}
                    {user.singleActiveSession ? <Badge className="bg-mint">one session</Badge> : null}
                  </div>
                </div>
                <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                  <select
                    className="h-10 rounded-md border border-ink/10 bg-paper px-3 text-sm outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
                    value={user.departmentId ?? ""}
                    disabled={isBusy}
                    onChange={(event) => updateUser(user.id, { departmentId: event.target.value })}
                  >
                    <option value="">No department</option>
                    {departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                  <Input
                    className="bg-paper"
                    placeholder="Category, e.g. Worker"
                    defaultValue={user.category ?? ""}
                    disabled={isBusy}
                    onBlur={(event) => updateUser(user.id, { category: event.target.value })}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      className="h-10 px-3"
                      variant="secondary"
                      disabled={isBusy}
                      onClick={() => updateUser(user.id, { forcePasswordReset: !user.forcePasswordReset })}
                    >
                      {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      Reset
                    </Button>
                    <Button
                      className="h-10 px-3"
                      variant="secondary"
                      disabled={isBusy}
                      onClick={() => updateUser(user.id, { singleActiveSession: !user.singleActiveSession })}
                    >
                      <ShieldCheck className="h-4 w-4" />
                      One session
                    </Button>
                    <Button className="h-10 px-3" variant="secondary" disabled={isBusy} onClick={() => revokeSessions(user)}>
                      <KeyRound className="h-4 w-4" />
                      Revoke sessions
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
