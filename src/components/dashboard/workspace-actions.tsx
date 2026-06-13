"use client";

import { useRouter } from "next/navigation";
import { FolderPlus, Loader2, Plus, UserRoundPlus } from "lucide-react";
import { FormEvent, useEffect, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type WorkspaceActionsProps = {
  canCreateWorkspace: boolean;
};

type OrganizationUnitOption = {
  id: string;
  parentId: string | null;
  type: string;
  name: string;
  canCreateWorkspace: boolean;
};

export function WorkspaceActions({ canCreateWorkspace }: WorkspaceActionsProps) {
  const router = useRouter();
  const formId = useId();
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; category: string }>>([]);
  const [organizationUnits, setOrganizationUnits] = useState<OrganizationUnitOption[]>([]);

  useEffect(() => {
    if (!canCreateWorkspace) return;
    Promise.all([
      fetch("/api/workspace-templates").then((response) => response.json()),
      fetch("/api/organization-units").then((response) => response.json())
    ])
      .then(([templateData, unitData]: [
        { templates?: Array<{ id: string; name: string; category: string }> },
        { units?: OrganizationUnitOption[] }
      ]) => {
        setTemplates(templateData.templates ?? []);
        setOrganizationUnits((unitData.units ?? []).filter((unit) => unit.canCreateWorkspace));
      })
      .catch(() => undefined);
  }, [canCreateWorkspace]);

  async function createWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("");
    setIsCreating(true);

    try {
      const form = event.currentTarget;
      const formData = new FormData(form);
      const response = await fetch("/api/workspaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: String(formData.get("name")),
          description: String(formData.get("description") ?? ""),
          templateId: String(formData.get("templateId") ?? "") || null,
          organizationUnitId: String(formData.get("organizationUnitId") ?? "") || null
        })
      });

      const data = (await response.json().catch(() => null)) as { workspace?: { id: string }; error?: string } | null;

      if (!response.ok || !data?.workspace) {
        setError(data?.error ?? "Workspace could not be created.");
        return;
      }

      form.reset();
      setStatus("Workspace created. Opening it now.");
      router.push(`/dashboard/workspaces/${data.workspace.id}`);
      router.refresh();
    } catch {
      setError("Workspace could not be created. Check the server and try again.");
    } finally {
      setIsCreating(false);
    }
  }

  async function joinWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setStatus("");
    setIsJoining(true);

    try {
      const form = event.currentTarget;
      const formData = new FormData(form);
      const response = await fetch("/api/workspaces/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          joinCode: String(formData.get("joinCode"))
        })
      });

      const data = (await response.json().catch(() => null)) as {
        workspace?: { id: string };
        error?: string;
      } | null;

      if (!response.ok || !data?.workspace) {
        setError(data?.error ?? "Workspace could not be joined.");
        return;
      }

      form.reset();
      setStatus("Workspace joined. Opening it now.");
      router.push(`/dashboard/workspaces/${data.workspace.id}`);
      router.refresh();
    } catch {
      setError("Workspace could not be joined. Check the server and try again.");
    } finally {
      setIsJoining(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? <p className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
      {status ? <p className="rounded-md bg-mint px-3 py-2 text-sm text-ink">{status}</p> : null}

      {canCreateWorkspace ? (
        <details className="rounded-md border border-ink/10 bg-white">
          <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium">
            <FolderPlus className="h-4 w-4 text-moss" />
            New workspace
          </summary>
          <form className="space-y-3 border-t border-ink/10 p-3" onSubmit={createWorkspace}>
            <div className="space-y-2">
              <Label htmlFor={`${formId}-workspace-name`}>Name</Label>
              <Input id={`${formId}-workspace-name`} name="name" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${formId}-workspace-description`}>Description</Label>
              <Textarea id={`${formId}-workspace-description`} name="description" rows={3} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${formId}-workspace-scope`}>Church network scope</Label>
              <select
                id={`${formId}-workspace-scope`}
                name="organizationUnitId"
                className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm outline-none focus:border-moss"
              >
                <option value="">Organization-wide workspace</option>
                {organizationUnits.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.type.toLowerCase()}: {unit.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`${formId}-workspace-template`}>Template</Label>
              <select
                id={`${formId}-workspace-template`}
                name="templateId"
                className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm outline-none focus:border-moss"
              >
                <option value="">Blank workspace</option>
                {templates.map((template) => (
                  <option key={template.id} value={template.id}>
                    {template.name} ({template.category.toLowerCase()})
                  </option>
                ))}
              </select>
            </div>
            <Button className="w-full" type="submit" disabled={isCreating}>
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create
            </Button>
          </form>
        </details>
      ) : null}

      <details className="rounded-md border border-ink/10 bg-white">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium">
          <UserRoundPlus className="h-4 w-4 text-moss" />
          Join workspace
        </summary>
        <form className="space-y-3 border-t border-ink/10 p-3" onSubmit={joinWorkspace}>
          <div className="space-y-2">
            <Label htmlFor={`${formId}-join-code`}>Join code</Label>
            <Input id={`${formId}-join-code`} name="joinCode" required />
          </div>
          <Button className="w-full" type="submit" disabled={isJoining}>
            {isJoining ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserRoundPlus className="h-4 w-4" />}
            Join
          </Button>
        </form>
      </details>
    </div>
  );
}
