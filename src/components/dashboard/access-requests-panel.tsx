"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, Loader2, ShieldQuestion, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";

type AccessRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

type AccessRequestRow = {
  id: string;
  targetType: "WORKSPACE" | "FILE";
  targetId: string;
  requestedRole: string;
  status: AccessRequestStatus;
  reason: string | null;
  decisionReason: string | null;
  createdAt: string;
  decidedAt: string | null;
  workspace: {
    id: string;
    name: string;
  };
  file: {
    id: string;
    fileName: string;
  } | null;
  requester: {
    name: string | null;
    email: string | null;
  };
  reviewer: {
    name: string | null;
    email: string | null;
  } | null;
};

type AccessRequestsPanelProps = {
  title: string;
  description: string;
  requests: AccessRequestRow[];
  reviewMode?: boolean;
};

const statusClassName: Record<AccessRequestStatus, string> = {
  PENDING: "bg-wheat",
  APPROVED: "bg-mint",
  REJECTED: "bg-clay/10 text-clay",
  CANCELLED: "bg-paper"
};

function personName(person?: { name: string | null; email: string | null } | null) {
  return person?.name ?? person?.email ?? "Unknown member";
}

export function AccessRequestsPanel({ title, description, requests, reviewMode = false }: AccessRequestsPanelProps) {
  const [rows, setRows] = useState(requests);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [grantDurations, setGrantDurations] = useState<Record<string, string>>({});
  const pendingCount = useMemo(() => rows.filter((request) => request.status === "PENDING").length, [rows]);

  async function reviewRequest(requestId: string, action: "APPROVE" | "REJECT" | "CANCEL") {
    setBusyId(requestId);
    setError("");
    const response = await fetch(`/api/access-requests/${requestId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        decisionReason: decisionNotes[requestId] ?? "",
        expiresInDays: action === "APPROVE" && grantDurations[requestId] ? Number(grantDurations[requestId]) : null
      })
    });
    const body = (await response.json().catch(() => null)) as { request?: AccessRequestRow; error?: string } | null;
    setBusyId("");

    if (!response.ok || !body?.request) {
      setError(body?.error ?? "Access request could not be reviewed.");
      return;
    }

    setRows((current) => current.map((request) => (request.id === requestId ? body.request! : request)));
    setDecisionNotes((current) => ({ ...current, [requestId]: "" }));
  }

  return (
    <section className="rounded-lg border border-ink/10 bg-white shadow-soft">
      <div className="flex flex-col gap-3 border-b border-ink/10 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-medium text-moss">
            <ShieldQuestion className="h-4 w-4" />
            {reviewMode ? "Access review desk" : "My access requests"}
          </p>
          <h2 className="mt-2 text-xl font-semibold text-ink">{title}</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink/60">{description}</p>
        </div>
        <Badge className={pendingCount ? "bg-wheat" : "bg-mint"}>{pendingCount} pending</Badge>
      </div>

      {error ? <p className="mx-5 mt-5 rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}

      <div className="divide-y divide-ink/10">
        {rows.length ? (
          rows.map((request) => (
            <article key={request.id} className="p-5">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={statusClassName[request.status]}>{request.status.toLowerCase()}</Badge>
                    <Badge className="bg-paper">{request.targetType.toLowerCase()}</Badge>
                    <span className="text-xs text-ink/50">{formatDate(request.createdAt)}</span>
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-ink">
                    {request.targetType === "WORKSPACE"
                      ? request.workspace.name
                      : `File access in ${request.workspace.name}`}
                  </h3>
                  {reviewMode ? (
                    <p className="mt-1 text-sm text-ink/60">Requested by {personName(request.requester)}</p>
                  ) : request.reviewer ? (
                    <p className="mt-1 text-sm text-ink/60">Reviewed by {personName(request.reviewer)}</p>
                  ) : null}
                  {request.targetType === "FILE" && reviewMode && request.file ? (
                    <p className="mt-1 break-words text-sm text-ink/60">File: {request.file.fileName}</p>
                  ) : null}
                  {request.reason ? <p className="mt-3 rounded-md bg-paper px-3 py-2 text-sm text-ink/70">{request.reason}</p> : null}
                  {request.decisionReason ? (
                    <p className="mt-2 rounded-md bg-mint/70 px-3 py-2 text-sm text-ink/70">{request.decisionReason}</p>
                  ) : null}
                </div>

                {request.status === "PENDING" ? (
                  <div className="w-full max-w-sm space-y-2">
                    {reviewMode ? (
                      <>
                        <Textarea
                          value={decisionNotes[request.id] ?? ""}
                          onChange={(event) =>
                            setDecisionNotes((current) => ({ ...current, [request.id]: event.target.value }))
                          }
                          placeholder="Optional decision note"
                        />
                        <label className="block text-xs font-medium text-ink/60">
                          Access duration
                          <select
                            className="mt-1 h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm text-ink outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
                            value={grantDurations[request.id] ?? ""}
                            onChange={(event) =>
                              setGrantDurations((current) => ({ ...current, [request.id]: event.target.value }))
                            }
                          >
                            <option value="">Permanent access</option>
                            <option value="1">Temporary: 1 day</option>
                            <option value="7">Temporary: 7 days</option>
                            <option value="30">Temporary: 30 days</option>
                            <option value="60">Temporary: 60 days</option>
                          </select>
                        </label>
                      </>
                    ) : null}
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      {reviewMode ? (
                        <>
                          <Button disabled={busyId === request.id} onClick={() => reviewRequest(request.id, "APPROVE")}>
                            {busyId === request.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                            Approve
                          </Button>
                          <Button
                            disabled={busyId === request.id}
                            variant="danger"
                            onClick={() => reviewRequest(request.id, "REJECT")}
                          >
                            {busyId === request.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                            Reject
                          </Button>
                        </>
                      ) : (
                        <Button
                          disabled={busyId === request.id}
                          variant="secondary"
                          onClick={() => reviewRequest(request.id, "CANCEL")}
                        >
                          {busyId === request.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                          Cancel request
                        </Button>
                      )}
                    </div>
                  </div>
                ) : request.decidedAt ? (
                  <p className="text-xs text-ink/50">Closed {formatDate(request.decidedAt)}</p>
                ) : null}
              </div>
            </article>
          ))
        ) : (
          <div className="p-8 text-center text-sm text-ink/55">
            No access requests yet.
          </div>
        )}
      </div>
    </section>
  );
}
