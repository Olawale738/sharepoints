"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, PlayCircle, Plus, Power, Trash2, Workflow } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type WorkflowRow = {
  id: string;
  name: string;
  trigger: string;
  enabled: boolean;
  actions: Array<{ type: string }>;
};

export function WorkflowBuilder({ workspaceId }: { workspaceId: string }) {
  const [workflows, setWorkflows] = useState<WorkflowRow[]>([]);
  const [runs, setRuns] = useState<Array<{ id: string; status: string; startedAt: string; errorMessage?: string | null }>>([]);
  const [name, setName] = useState("Review and notify leaders");
  const [trigger, setTrigger] = useState("FILE_UPLOADED");
  const [recipe, setRecipe] = useState("APPROVE_NOTIFY");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const response = await fetch(`/api/workspaces/${workspaceId}/workflows`);
    const data = (await response.json().catch(() => null)) as {
      workflows?: WorkflowRow[];
      runs?: typeof runs;
      error?: string;
    } | null;
    setLoading(false);
    if (!response.ok) {
      setError(data?.error ?? "Workflows could not be loaded.");
      return;
    }
    setWorkflows(data?.workflows ?? []);
    setRuns(data?.runs ?? []);
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create() {
    setError("");
    const actions =
      recipe === "APPROVE_NOTIFY"
        ? [
            { type: "REQUEST_APPROVAL" },
            { type: "NOTIFY_ROLE", roles: ["ADMIN", "LEADER"], title: "Document awaiting review" }
          ]
        : recipe === "ARCHIVE"
          ? [{ type: "ARCHIVE_FILE" }]
          : [{ type: "CREATE_TASK", title: "Follow up on uploaded document" }];
    const response = await fetch(`/api/workspaces/${workspaceId}/workflows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, trigger, actions })
    });
    const data = (await response.json().catch(() => null)) as { workflow?: WorkflowRow; error?: string } | null;
    if (!response.ok || !data?.workflow) {
      setError(data?.error ?? "Workflow could not be created.");
      return;
    }
    setWorkflows((current) => [data.workflow as WorkflowRow, ...current]);
  }

  async function update(workflow: WorkflowRow, remove = false) {
    const response = await fetch(`/api/workflows/${workflow.id}`, {
      method: remove ? "DELETE" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: remove ? undefined : JSON.stringify({ enabled: !workflow.enabled })
    });
    if (!response.ok) return;
    setWorkflows((current) =>
      remove
        ? current.filter((item) => item.id !== workflow.id)
        : current.map((item) => (item.id === workflow.id ? { ...item, enabled: !item.enabled } : item))
    );
  }

  return (
    <section className="rounded-lg border border-ink/10 bg-white">
      <div className="flex items-center gap-2 border-b border-ink/10 px-4 py-3">
        <Workflow className="h-4 w-4 text-moss" />
        <h2 className="text-sm font-semibold">Workflow automation</h2>
      </div>
      <div className="space-y-3 p-4">
        <Input value={name} onChange={(event) => setName(event.target.value)} />
        <select
          className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm"
          value={trigger}
          onChange={(event) => setTrigger(event.target.value)}
        >
          <option value="FILE_UPLOADED">When a file is uploaded</option>
          <option value="FILE_APPROVED">When a file is approved</option>
          <option value="TASK_CREATED">When a task is created</option>
          <option value="MEETING_ENDED">When a meeting ends</option>
          <option value="FORM_SUBMITTED">When a form is submitted</option>
        </select>
        <select
          className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm"
          value={recipe}
          onChange={(event) => setRecipe(event.target.value)}
        >
          <option value="APPROVE_NOTIFY">Request approval, then notify leaders</option>
          <option value="TASK">Create a follow-up task</option>
          <option value="ARCHIVE">Move the file to Archive</option>
        </select>
        {error ? <p className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
        <Button className="w-full" onClick={create}>
          <Plus className="h-4 w-4" />
          Create workflow
        </Button>
      </div>
      <div className="divide-y divide-ink/10 border-t border-ink/10">
        {loading ? <p className="flex items-center gap-2 p-4 text-sm text-ink/55"><Loader2 className="h-4 w-4 animate-spin" />Loading</p> : null}
        {workflows.map((workflow) => (
          <div key={workflow.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{workflow.name}</p>
              <p className="text-xs text-ink/50">{workflow.trigger.toLowerCase().replaceAll("_", " ")} · {workflow.actions.length} actions</p>
            </div>
            <div className="flex gap-1">
              <Button className="h-8 w-8 px-0" variant="secondary" onClick={() => update(workflow)}>
                <Power className={`h-4 w-4 ${workflow.enabled ? "text-moss" : "text-ink/35"}`} />
              </Button>
              <Button className="h-8 w-8 px-0" variant="danger" onClick={() => update(workflow, true)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
      {runs.length ? (
        <div className="border-t border-ink/10 px-4 py-3">
          <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase text-ink/45">
            <PlayCircle className="h-3.5 w-3.5" /> Recent runs
          </p>
          {runs.slice(0, 5).map((run) => (
            <p key={run.id} className="text-xs text-ink/55">{run.status.toLowerCase()} · {new Date(run.startedAt).toLocaleString()}</p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
