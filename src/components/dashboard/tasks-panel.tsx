"use client";

import { FormEvent, useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, Circle, GripVertical, Loader2, MessageSquareText, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";

type TaskStatus = "TODO" | "IN_PROGRESS" | "BLOCKED" | "DONE";
type TaskPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

type MemberOption = {
  userId: string;
  user: {
    name?: string | null;
    email?: string | null;
  };
};

type TaskComment = {
  id: string;
  body: string;
  createdAt: string;
  author: {
    name?: string | null;
    email?: string | null;
  };
};

type Task = {
  id: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority?: TaskPriority;
  approvalStatus?: ApprovalStatus;
  rejectedReason?: string | null;
  dueDate?: string | null;
  reminderAt?: string | null;
  assignedTo?: {
    id: string;
    name?: string | null;
    email?: string | null;
  } | null;
  assignees?: Array<{
    userId: string;
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
    };
  }>;
  comments?: TaskComment[];
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

const statusOrder: TaskStatus[] = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE"];

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

const priorityClasses: Record<TaskPriority, string> = {
  LOW: "bg-ink/10 text-ink/60",
  NORMAL: "bg-mint text-ink",
  HIGH: "bg-wheat text-ink",
  URGENT: "bg-clay text-white"
};

const approvalClasses: Record<ApprovalStatus, string> = {
  PENDING: "bg-wheat",
  APPROVED: "bg-mint",
  REJECTED: "bg-clay/10 text-clay"
};

function toIsoDueDate(value: FormDataEntryValue | null) {
  const date = String(value ?? "").trim();
  return date ? new Date(`${date}T12:00:00.000Z`).toISOString() : "";
}

function toIsoDateTime(value: FormDataEntryValue | null) {
  const date = String(value ?? "").trim();
  return date ? new Date(date).toISOString() : "";
}

function taskDateInputValue(value?: string | null) {
  return value ? value.slice(0, 10) : "";
}

function displayUser(user?: { name?: string | null; email?: string | null } | null) {
  return user?.name ?? user?.email ?? "Unassigned";
}

function normalizeTask(task: Task): Task {
  return {
    ...task,
    priority: task.priority ?? "NORMAL",
    approvalStatus: task.approvalStatus ?? "APPROVED",
    assignees: task.assignees ?? [],
    comments: task.comments ?? []
  };
}

export function TasksPanel({ workspaceId, tasks: initialTasks, members, canManage }: TasksPanelProps) {
  const [tasks, setTasks] = useState(initialTasks.map(normalizeTask));
  const [busyTaskId, setBusyTaskId] = useState("");
  const [draggingTaskId, setDraggingTaskId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commentBodyByTask, setCommentBodyByTask] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

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
    setStatus("");
    setIsSubmitting(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const assigneeIds = formData.getAll("assigneeIds").map((value) => String(value)).filter(Boolean);
    const response = await fetch(`/api/workspaces/${workspaceId}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: String(formData.get("title")),
        description: String(formData.get("description") ?? ""),
        status: String(formData.get("status")),
        priority: String(formData.get("priority")),
        dueDate: toIsoDueDate(formData.get("dueDate")),
        reminderAt: toIsoDateTime(formData.get("reminderAt")),
        assignedToId: assigneeIds[0] ?? "",
        assigneeIds
      })
    });

    setIsSubmitting(false);
    const data = (await response.json().catch(() => null)) as { task?: Task; error?: string } | null;

    if (!response.ok || !data?.task) {
      setError(data?.error ?? "Task could not be created.");
      return;
    }

    setTasks((current) => [normalizeTask(data.task as Task), ...current]);
    setStatus(data.task.approvalStatus === "PENDING" ? "Task sent for approval." : "Task created.");
    form.reset();
  }

  async function updateTask(
    taskId: string,
    body: Partial<Pick<Task, "status" | "title" | "description" | "dueDate" | "reminderAt" | "priority">> & {
      assignedToId?: string;
      assigneeIds?: string[];
    }
  ) {
    setError("");
    setStatus("");
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

    setTasks((current) => current.map((task) => (task.id === taskId ? normalizeTask(data.task as Task) : task)));
  }

  async function deleteTask(taskId: string) {
    setError("");
    setStatus("");
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

  async function createComment(event: FormEvent<HTMLFormElement>, taskId: string) {
    event.preventDefault();
    const body = (commentBodyByTask[taskId] ?? "").trim();

    if (!body) {
      return;
    }

    setError("");
    setBusyTaskId(taskId);
    const response = await fetch(`/api/tasks/${taskId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body })
    });
    setBusyTaskId("");

    const data = (await response.json().catch(() => null)) as { comment?: TaskComment; error?: string } | null;

    if (!response.ok || !data?.comment) {
      setError(data?.error ?? "Comment could not be added.");
      return;
    }

    setTasks((current) =>
      current.map((task) =>
        task.id === taskId
          ? {
              ...task,
              comments: [data.comment as TaskComment, ...(task.comments ?? [])].slice(0, 5)
            }
          : task
      )
    );
    setCommentBodyByTask((current) => ({ ...current, [taskId]: "" }));
  }

  function onDropStatus(statusValue: TaskStatus) {
    if (!canManage || !draggingTaskId) {
      return;
    }

    const task = tasks.find((item) => item.id === draggingTaskId);
    setDraggingTaskId("");

    if (!task || task.status === statusValue) {
      return;
    }

    void updateTask(task.id, { status: statusValue });
  }

  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-moss" />
          <h2 className="text-sm font-semibold">Planner task board</h2>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {statusOrder.map((taskStatus) => (
            <Badge key={taskStatus} className={statusClasses[taskStatus]}>
              {statusLabels[taskStatus]} {taskCounts[taskStatus]}
            </Badge>
          ))}
        </div>
      </div>

      {canManage ? (
        <form className="mb-4 grid gap-3 rounded-md border border-ink/10 bg-paper p-3 lg:grid-cols-4" onSubmit={createTask}>
          <Input className="lg:col-span-2" name="title" placeholder="Task title" required />
          <select
            className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
            defaultValue="TODO"
            name="status"
          >
            {statusOrder.map((taskStatus) => (
              <option key={taskStatus} value={taskStatus}>
                {statusLabels[taskStatus]}
              </option>
            ))}
          </select>
          <select
            className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
            defaultValue="NORMAL"
            name="priority"
          >
            {(["LOW", "NORMAL", "HIGH", "URGENT"] as TaskPriority[]).map((priority) => (
              <option key={priority} value={priority}>
                {priority.toLowerCase()}
              </option>
            ))}
          </select>
          <Input name="dueDate" type="date" />
          <Input name="reminderAt" type="datetime-local" />
          <select
            className="min-h-24 rounded-md border border-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-moss focus:ring-2 focus:ring-moss/20 lg:col-span-2"
            name="assigneeIds"
            multiple
          >
            {members.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.user.name ?? member.user.email}
              </option>
            ))}
          </select>
          <Textarea className="lg:col-span-3" name="description" placeholder="Notes, owner context, or blockers" rows={2} />
          <div className="flex items-end justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Circle className="h-4 w-4" />}
              Create task
            </Button>
          </div>
        </form>
      ) : null}

      {error ? <p className="mb-3 rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
      {status ? <p className="mb-3 rounded-md bg-mint/70 px-3 py-2 text-sm text-ink">{status}</p> : null}

      <div className="grid gap-3 xl:grid-cols-4">
        {statusOrder.map((taskStatus) => {
          const laneTasks = tasks.filter((task) => task.status === taskStatus);

          return (
            <section
              key={taskStatus}
              className="min-h-64 rounded-md border border-ink/10 bg-paper p-3"
              onDragOver={(event) => {
                if (canManage) {
                  event.preventDefault();
                }
              }}
              onDrop={() => onDropStatus(taskStatus)}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">{statusLabels[taskStatus]}</h3>
                <Badge className={statusClasses[taskStatus]}>{laneTasks.length}</Badge>
              </div>
              <div className="space-y-3">
                {laneTasks.length === 0 ? <p className="rounded-md bg-white px-3 py-4 text-sm text-ink/50">No tasks.</p> : null}
                {laneTasks.map((task) => (
                  <article
                    key={task.id}
                    className="rounded-md border border-ink/10 bg-white p-3 shadow-sm"
                    draggable={canManage}
                    onDragStart={() => setDraggingTaskId(task.id)}
                  >
                    <div className="mb-2 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <Badge className={priorityClasses[task.priority ?? "NORMAL"]}>{(task.priority ?? "NORMAL").toLowerCase()}</Badge>
                          {task.approvalStatus ? (
                            <Badge className={approvalClasses[task.approvalStatus]}>{task.approvalStatus.toLowerCase()}</Badge>
                          ) : null}
                        </div>
                        <h4 className="text-sm font-semibold text-ink">{task.title}</h4>
                      </div>
                      {canManage ? <GripVertical className="h-4 w-4 shrink-0 text-ink/30" /> : null}
                    </div>

                    {task.rejectedReason ? <p className="mb-2 rounded-md bg-clay/10 px-2 py-1 text-xs text-clay">{task.rejectedReason}</p> : null}
                    {task.description ? <p className="whitespace-pre-wrap text-sm text-ink/65">{task.description}</p> : null}
                    <div className="mt-3 space-y-1 text-xs text-ink/50">
                      {task.dueDate ? (
                        <p className="flex items-center gap-1">
                          <CalendarClock className="h-3.5 w-3.5 text-moss" />
                          Due {formatDate(task.dueDate)}
                        </p>
                      ) : null}
                      {task.reminderAt ? (
                        <p className="flex items-center gap-1">
                          <CalendarClock className="h-3.5 w-3.5 text-clay" />
                          Reminder {formatDate(task.reminderAt)}
                        </p>
                      ) : null}
                      <p>
                        Assigned to{" "}
                        {(task.assignees?.length ? task.assignees.map((assignee) => displayUser(assignee.user)).join(", ") : displayUser(task.assignedTo))}
                      </p>
                      <p>Created by {task.createdBy.name ?? task.createdBy.email} on {formatDate(task.createdAt)}</p>
                    </div>

                    {canManage ? (
                      <div className="mt-3 grid gap-2">
                        <select
                          className="h-9 rounded-md border border-ink/10 bg-paper px-2 text-xs outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
                          value={task.status}
                          disabled={busyTaskId === task.id}
                          onChange={(event) => updateTask(task.id, { status: event.target.value as TaskStatus })}
                        >
                          {statusOrder.map((statusOption) => (
                            <option key={statusOption} value={statusOption}>
                              {statusLabels[statusOption]}
                            </option>
                          ))}
                        </select>
                        <select
                          className="h-9 rounded-md border border-ink/10 bg-paper px-2 text-xs outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
                          value={task.priority ?? "NORMAL"}
                          disabled={busyTaskId === task.id}
                          onChange={(event) => updateTask(task.id, { priority: event.target.value as TaskPriority })}
                        >
                          {(["LOW", "NORMAL", "HIGH", "URGENT"] as TaskPriority[]).map((priority) => (
                            <option key={priority} value={priority}>
                              {priority.toLowerCase()}
                            </option>
                          ))}
                        </select>
                        <select
                          className="h-9 rounded-md border border-ink/10 bg-paper px-2 text-xs outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
                          value={task.assignedTo?.id ?? task.assignees?.[0]?.userId ?? ""}
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
                          className="h-9 bg-paper text-xs"
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
                          className="h-9 w-full"
                          variant="ghost"
                          disabled={busyTaskId === task.id}
                          onClick={() => deleteTask(task.id)}
                        >
                          {busyTaskId === task.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          Delete
                        </Button>
                      </div>
                    ) : null}

                    <div className="mt-3 border-t border-ink/10 pt-3">
                      <p className="mb-2 flex items-center gap-1 text-xs font-medium text-ink/60">
                        <MessageSquareText className="h-3.5 w-3.5 text-moss" />
                        Comments
                      </p>
                      <div className="space-y-2">
                        {(task.comments ?? []).slice(0, 3).map((comment) => (
                          <div key={comment.id} className="rounded-md bg-paper px-2 py-2 text-xs">
                            <p className="text-ink/75">{comment.body}</p>
                            <p className="mt-1 text-ink/40">
                              {comment.author.name ?? comment.author.email} - {formatDate(comment.createdAt)}
                            </p>
                          </div>
                        ))}
                      </div>
                      <form className="mt-2 flex gap-2" onSubmit={(event) => createComment(event, task.id)}>
                        <Input
                          className="h-9 bg-paper text-xs"
                          placeholder="Add comment"
                          value={commentBodyByTask[task.id] ?? ""}
                          onChange={(event) =>
                            setCommentBodyByTask((current) => ({
                              ...current,
                              [task.id]: event.target.value
                            }))
                          }
                        />
                        <Button className="h-9 px-3" variant="secondary" disabled={busyTaskId === task.id} type="submit">
                          Send
                        </Button>
                      </form>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
