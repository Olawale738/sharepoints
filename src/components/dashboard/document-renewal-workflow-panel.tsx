"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Archive, Bell, CheckCircle2, FileClock, Loader2, RefreshCw, Trash2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type RenewalItem = {
  id: string;
  title: string;
  targetType: string;
  targetId?: string | null;
  workspaceId?: string | null;
  ownerId?: string | null;
  reviewDueAt?: string | null;
  expiresAt?: string | null;
  status: string;
  notes?: string | null;
  createdAt: string;
  workspaceName?: string | null;
  ownerName?: string | null;
};

function formatDate(value?: string | null) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

function isOverdue(item: RenewalItem) {
  const date = item.expiresAt ?? item.reviewDueAt;
  return Boolean(date && new Date(date) < new Date() && !["ARCHIVED", "RENEWED"].includes(item.status));
}

function isDueSoon(item: RenewalItem) {
  const date = item.reviewDueAt ?? item.expiresAt;
  if (!date || ["ARCHIVED", "RENEWED"].includes(item.status)) return false;
  const days = (new Date(date).getTime() - Date.now()) / 86_400_000;
  return days >= 0 && days <= 30;
}

export function DocumentRenewalWorkflowPanel({ items }: { items: RenewalItem[] }) {
  const [records, setRecords] = useState(items);
  const [busyId, setBusyId] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const groups = useMemo(
    () => [
      { key: "overdue", title: "Overdue", items: records.filter(isOverdue) },
      { key: "soon", title: "Due soon", items: records.filter((item) => !isOverdue(item) && isDueSoon(item)) },
      {
        key: "active",
        title: "Active",
        items: records.filter((item) => item.status === "ACTIVE" && !isOverdue(item) && !isDueSoon(item))
      },
      { key: "renewed", title: "Renewed", items: records.filter((item) => item.status === "RENEWED") },
      { key: "archived", title: "Archived", items: records.filter((item) => item.status === "ARCHIVED") }
    ],
    [records]
  );

  async function run(item: RenewalItem, action: string) {
    setBusyId(`${item.id}:${action}`);
    setMessage("");
    setError("");
    const response = await fetch("/api/admin/document-renewals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId: item.id, action, note: note || null })
    });
    const payload = await response.json().catch(() => null);
    setBusyId("");

    if (!response.ok) {
      setError(payload?.error ?? "Document renewal action failed.");
      return;
    }

    if (action === "DELETE") {
      setRecords((current) => current.filter((record) => record.id !== item.id));
      setMessage("Renewal record deleted.");
      return;
    }

    if (payload?.result) {
      setRecords((current) =>
        current.map((record) =>
          record.id === item.id
            ? {
                ...record,
                ...payload.result,
                reviewDueAt: payload.result.reviewDueAt ? new Date(payload.result.reviewDueAt).toISOString() : null,
                expiresAt: payload.result.expiresAt ? new Date(payload.result.expiresAt).toISOString() : null
              }
            : record
        )
      );
    }
    setMessage(action === "REMIND" ? "Reminder sent." : "Renewal record updated.");
  }

  function actionButton(item: RenewalItem, action: string, label: string, icon: ReactNode, variant: "primary" | "secondary" | "ghost" | "danger" = "secondary") {
    const busy = busyId === `${item.id}:${action}`;
    return (
      <Button className="h-9 px-3" disabled={Boolean(busyId)} onClick={() => run(item, action)} variant={variant}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
        {label}
      </Button>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
        <div className="grid gap-3 md:grid-cols-5">
          {groups.map((group) => (
            <div className="rounded-md border border-ink/10 bg-paper p-3" key={group.key}>
              <p className="text-2xl font-semibold text-ink">{group.items.length}</p>
              <p className="text-sm text-ink/55">{group.title}</p>
            </div>
          ))}
        </div>
        <label className="mt-4 block space-y-2 text-sm font-medium text-ink">
          Optional review note
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note before sending a reminder or renewing a document." />
        </label>
        {message ? <p className="mt-3 rounded-md bg-mint px-3 py-2 text-sm text-ink">{message}</p> : null}
        {error ? <p className="mt-3 rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
      </section>

      {groups.map((group) => (
        <section className="rounded-lg border border-ink/10 bg-white shadow-soft" key={group.key}>
          <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
              <FileClock className="h-4 w-4 text-moss" />
              {group.title}
            </h2>
            <Badge>{group.items.length}</Badge>
          </div>
          <div className="divide-y divide-ink/10">
            {group.items.length === 0 ? <p className="px-4 py-8 text-sm text-ink/55">No {group.title.toLowerCase()} records.</p> : null}
            {group.items.map((item) => (
              <div className="space-y-3 px-4 py-4" key={item.id}>
                <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink">{item.title}</p>
                      <Badge>{item.targetType.toLowerCase()}</Badge>
                      <Badge className={item.status === "EXPIRED" ? "bg-clay/10 text-clay" : item.status === "RENEWED" ? "bg-mint" : "bg-paper"}>
                        {item.status.toLowerCase().replaceAll("_", " ")}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-ink/55">
                      Owner: {item.ownerName ?? "Admin fallback"} - Workspace: {item.workspaceName ?? "Organization-wide"}
                    </p>
                    <p className="mt-1 text-xs text-ink/55">
                      Review: {formatDate(item.reviewDueAt)} - Expires: {formatDate(item.expiresAt)}
                    </p>
                    {item.notes ? <p className="mt-2 max-w-3xl text-sm text-ink/60">{item.notes}</p> : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {actionButton(item, "REMIND", "Remind", <Bell className="h-4 w-4" />)}
                  {actionButton(item, "REVIEWED", "Reviewed", <CheckCircle2 className="h-4 w-4" />)}
                  {actionButton(item, "RENEW_1_YEAR", "Renew 1 year", <RefreshCw className="h-4 w-4" />)}
                  {actionButton(item, "MARK_EXPIRED", "Expired", <XCircle className="h-4 w-4" />)}
                  {actionButton(item, "ARCHIVE", "Archive", <Archive className="h-4 w-4" />, "ghost")}
                  {actionButton(item, "DELETE", "Delete", <Trash2 className="h-4 w-4" />, "danger")}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
