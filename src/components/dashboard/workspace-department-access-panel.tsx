"use client";

import { useMemo, useState } from "react";
import { Building2, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";

type Department = {
  id: string;
  name: string;
  kind: string;
};

type DepartmentAccess = {
  id: string;
  departmentId: string;
  canAccessWorkspace: boolean;
  canAccessChat: boolean;
};

type WorkspaceDepartmentAccessPanelProps = {
  workspaceId: string;
  departments: Department[];
  access: DepartmentAccess[];
};

function kindLabel(kind: string) {
  return kind.toLowerCase().replaceAll("_", " ");
}

export function WorkspaceDepartmentAccessPanel({
  workspaceId,
  departments,
  access: initialAccess
}: WorkspaceDepartmentAccessPanelProps) {
  const [access, setAccess] = useState(initialAccess);
  const [busyDepartmentId, setBusyDepartmentId] = useState("");
  const [error, setError] = useState("");
  const accessByDepartment = useMemo(
    () => new Map(access.map((row) => [row.departmentId, row])),
    [access]
  );
  const restrictedCount = access.filter((row) => row.canAccessWorkspace || row.canAccessChat).length;

  async function updateAccess(departmentId: string, field: "canAccessWorkspace" | "canAccessChat", value: boolean) {
    const current = accessByDepartment.get(departmentId);
    const body = {
      departmentId,
      canAccessWorkspace: field === "canAccessWorkspace" ? value : current?.canAccessWorkspace ?? false,
      canAccessChat: field === "canAccessChat" ? value : current?.canAccessChat ?? false
    };

    setError("");
    setBusyDepartmentId(departmentId);
    const response = await fetch(`/api/workspaces/${workspaceId}/department-access`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    setBusyDepartmentId("");

    const data = (await response.json().catch(() => null)) as { access?: DepartmentAccess | null; error?: string } | null;

    if (!response.ok) {
      setError(data?.error ?? "Department access could not be updated.");
      return;
    }

    setAccess((currentRows) => {
      const remaining = currentRows.filter((row) => row.departmentId !== departmentId);

      if (!data?.access) {
        return remaining;
      }

      return [...remaining, data.access];
    });
  }

  return (
    <section className="rounded-lg border border-ink/10 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-moss" />
          <h2 className="text-sm font-semibold">Department access</h2>
        </div>
        <Badge className={restrictedCount ? "bg-wheat" : "bg-mint"}>{restrictedCount ? "restricted" : "open"}</Badge>
      </div>
      <div className="p-4">
        <p className="mb-3 text-xs text-ink/55">
          If no department is selected, every workspace member can access files and chat. Once selected, only matching departments can enter.
        </p>
        {error ? <p className="mb-3 rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
        <div className="space-y-2">
          {departments.length === 0 ? (
            <p className="rounded-md bg-paper px-3 py-4 text-sm text-ink/55">Create departments in the admin center first.</p>
          ) : null}
          {departments.map((department) => {
            const row = accessByDepartment.get(department.id);
            const isBusy = busyDepartmentId === department.id;

            return (
              <div key={department.id} className="rounded-md border border-ink/10 bg-paper p-3">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{department.name}</p>
                    <p className="text-xs text-ink/45">{kindLabel(department.kind)}</p>
                  </div>
                  {isBusy ? <Loader2 className="h-4 w-4 animate-spin text-moss" /> : null}
                </div>
                <div className="grid gap-2 text-sm">
                  <label className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2">
                    <span>Workspace</span>
                    <input
                      className="h-4 w-4 accent-moss"
                      type="checkbox"
                      checked={Boolean(row?.canAccessWorkspace)}
                      disabled={isBusy}
                      onChange={(event) => updateAccess(department.id, "canAccessWorkspace", event.target.checked)}
                    />
                  </label>
                  <label className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2">
                    <span>Chat</span>
                    <input
                      className="h-4 w-4 accent-moss"
                      type="checkbox"
                      checked={Boolean(row?.canAccessChat)}
                      disabled={isBusy}
                      onChange={(event) => updateAccess(department.id, "canAccessChat", event.target.checked)}
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
