"use client";

import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, Circle, Clock3, Loader2, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";

type TaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE";

type MemberOption = {
  userId: string;
  user: {
    name?: string | null;
    email?: string | null;
  };
};

type Task = {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  dueDate?: string | null;
  assignedTo?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
  createdBy: {
    name?: string | null;
    email?: string | null;
  };
  createdAt: string;
};

type TasksPanelProps = {
  workspaceId: string;
  tasks: Task[];
  members: MemberOption[];
  canManage: boolean;
};

const statusLabels: Record<TaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  BLOCKED: "Blocked",
  DONE: "Done"
};

const statusClasses: Record<TaskStatus, string> = {
  TODO: "bg-wheat text-ink",
  IN_PROGRESS: "bg-mint text-ink",
  BLOCKED: "bg-clay/10 text-clay",
  DONE: "bg-moss text-white"
};

function toIsoDueDate(value: FormDataEntryValue | null) {
  const date = String(value ?? "").trim();
  return date ? new Date(`${date}T12:00:00.000Z`).toISOString() : "";
}

function taskDateInputValue(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

export function TasksPanel({ workspaceId, tasks: initialTasks, members, canManage }: TasksPanelProps) {
  const [tasks, setTasks] = useState(initialTasks);
  const [busyTaskId, setBusyTaskId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const taskCounts = useMemo(
    () =>
      tasks.reduce<Record<TaskStatus, number>>(
        (counts, task) => ({
          ...counts,
          [task.status]: counts[task.status] + 1
        }),
        { TODO: 0, IN_PROGRESS: 0, BLOCKED: 0, DONE: 0 }
      ),
    [tasks]
  );

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch(`/api/workspaces/${workspaceId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: String(formData.get("title")),
        description: String(formData.get("description") ?? ""),
        status: String(formData.get("status")),
        dueDate: toIsoDueDate(formData.get("dueDate")),
        assignedToId: String(formData.get("assignedToId") ?? "")
      })
    });

    setIsSubmitting(false);
    const data = (await response.json().catch(() => null)) as { task?: Task; error?: string } | null;

    if (!response.ok || !data?.task) {
      setError(data?.error ?? "Task could not be created.");
      return;
    }

    setTasks((current) => [data.task as Task, ...current]);
    form.reset();
  }

  async function updateTask(taskId: string, body: Partial<Pick<Task, "status" | "title" | "description" | "dueDate">> & {
    assignedToId?: string;
  }) {
    setError("");
    setBusyTaskId(taskId);
    const response = await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    setBusyTaskId("");

    const data = (await response.json().catch(() => null)) as { task?: Task; error?: string } | null;

    if (!response.ok || !data?.task) {
      setError(data?.error ?? "Task could not be updated.");
      return;
    }

    setTasks((current) => current.map((task) => (task.id === taskId ? data.task as Task : task)));
  }

  async function deleteTask(taskId: string) {
    setError("");
    setBusyTaskId(taskId);
    const response = await fetch(`/api/tasks/${taskId}`, {
      method: "DELETE"
    });
    setBusyTaskId("");

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Task could not be deleted.");
      return;
    }

    setTasks((current) => current.filter((task) => task.id !== taskId));
  }

  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-moss" />
          <h2 className="text-sm font-semibold">Tasks</h2>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {(Object.keys(statusLabels) as TaskStatus[]).map((status) => (
            <Badge key={status} className={statusClasses[status]}>
              {statusLabels[status]} {taskCounts[status]}
            </Badge>
          ))}
        </div>
      </div>

      {canManage ? (
        <form className="mb-4 grid gap-3 rounded-md border border-ink/10 bg-paper p-3 lg:grid-cols-2" onSubmit={createTask}>
          <Input className="lg:col-span-2" name="title" placeholder="Task title" required />
          <select
            className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
            defaultValue="TODO"
            name="status"
          >
            {(Object.keys(statusLabels) as TaskStatus[]).map((status) => (
              <option key={status} value={status}>
                {statusLabels[status]}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
            defaultValue=""
            name="assignedToId"
          >
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.user.name ?? member.user.email}
              </option>
            ))}
          </select>
          <Input name="dueDate" type="date" />
          <div className="flex items-center justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Circle className="h-4 w-4" />}
              Create task
            </Button>
          </div>
          <Textarea className="lg:col-span-2" name="description" placeholder="Notes, owner context, or blockers" rows={2} />
        </form>
      ) : null}

      {error ? <p className="mb-3 rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}

      <div className="space-y-3">
        {tasks.length === 0 ? <p className="text-sm text-ink/55">No tasks yet.</p> : null}
        {tasks.map((task) => (
          <article key={task.id} className="rounded-md border border-ink/10 bg-paper p-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge className={statusClasses[task.status]}>{statusLabels[task.status]}</Badge>
                  {task.dueDate ? (
                    <span className="inline-flex items-center gap-1 text-xs text-ink/55">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatDate(task.dueDate)}
                    </span>
                  ) : null}
                </div>
                <h3 className="text-sm font-semibold text-ink">{task.title}</h3>
                {task.description ? <p className="mt-1 whitespace-pre-wrap text-sm text-ink/65">{task.description}</p> : null}
                <p className="mt-2 text-xs text-ink/50">
                  Assigned to {task.assignedTo?.name ?? task.assignedTo?.email ?? "no one"} - created by{" "}
                  {task.createdBy.name ?? task.createdBy.email} on {formatDate(task.createdAt)}
                </p>
              </div>
              {canManage ? (
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <select
                    className="h-9 rounded-md border border-ink/10 bg-white px-2 text-xs outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
                    value={task.status}
                    disabled={busyTaskId === task.id}
                    onChange={(event) => updateTask(task.id, { status: event.target.value as TaskStatus })}
                  >
                    {(Object.keys(statusLabels) as TaskStatus[]).map((status) => (
                      <option key={status} value={status}>
                        {statusLabels[status]}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-9 rounded-md border border-ink/10 bg-white px-2 text-xs outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
                    value={task.assignedTo?.id ?? ""}
                    disabled={busyTaskId === task.id}
                    onChange={(event) => updateTask(task.id, { assignedToId: event.target.value })}
                  >
                    <option value="">Unassigned</option>
                    {members.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.user.name ?? member.user.email}
                      </option>
                    ))}
                  </select>
                  <Input
                    className="h-9 w-36"
                    type="date"
                    value={taskDateInputValue(task.dueDate)}
                    disabled={busyTaskId === task.id}
                    onChange={(event) =>
                      updateTask(task.id, {
                        dueDate: event.target.value ? new Date(`${event.target.value}T12:00:00.000Z`).toISOString() : ""
                      })
                    }
                  />
                  <Button
                    aria-label={`Delete task ${task.title}`}
                    className="h-9 w-9 px-0"
                    variant="ghost"
                    disabled={busyTaskId === task.id}
                    onClick={() => deleteTask(task.id)}
                  >
                    {busyTaskId === task.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
