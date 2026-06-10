"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, Loader2, XCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

type ApprovalRequest = {
  id: string;
  targetType: string;
  targetId: string;
  title: string;
  status: ApprovalStatus;
  reason?: string | null;
  createdAt: string;
  reviewedAt?: string | null;
  workspace: {
    id: string;
    name: string;
  };
  requester: {
    name?: string | null;
    email?: string | null;
  };
  reviewer?: {
    name?: string | null;
    email?: string | null;
  } | null;
};

type ApprovalQueueProps = {
  approvals: ApprovalRequest[];
  title?: string;
  compact?: boolean;
};

const statusClassName: Record<ApprovalStatus, string> = {
  PENDING: "bg-wheat",
  APPROVED: "bg-mint",
  REJECTED: "bg-clay/10 text-clay"
};

function targetLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

export function ApprovalQueue({ approvals: initialApprovals, title = "Approval workflow", compact = false }: ApprovalQueueProps) {
  const [approvals, setApprovals] = useState(initialApprovals);
  const [busyId, setBusyId] = useState("");
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<ApprovalStatus | "ALL">("PENDING");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const counts = useMemo(
    () =>
      approvals.reduce(
        (summary, approval) => ({
          ...summary,
          [approval.status]: summary[approval.status] + 1
        }),
        { PENDING: 0, APPROVED: 0, REJECTED: 0 } as Record<ApprovalStatus, number>
      ),
    [approvals]
  );

  const visibleApprovals = filter === "ALL" ? approvals : approvals.filter((approval) => approval.status === filter);

  async function decide(approvalId: string, decision: "APPROVED" | "REJECTED") {
    setError("");
    setStatus("");
    setBusyId(approvalId);
    const response = await fetch(`/api/approvals/${approvalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: decision,
        reason: reasonById[approvalId] ?? ""
      })
    });
    setBusyId("");

    const data = (await response.json().catch(() => null)) as { approval?: ApprovalRequest; error?: string } | null;

    if (!response.ok || !data?.approval) {
      setError(data?.error ?? "Approval decision could not be saved.");
      return;
    }

    setApprovals((current) => current.map((approval) => (approval.id === data.approval?.id ? data.approval : approval)));
    setStatus(`${data.approval.title} was ${data.approval.status.toLowerCase()}.`);
  }

  return (
    <section className="rounded-lg border border-ink/10 bg-white">
      <div className="flex flex-col gap-3 border-b border-ink/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-4 w-4 text-moss" />
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["PENDING", "APPROVED", "REJECTED"] as ApprovalStatus[]).map((approvalStatus) => (
            <button
              key={approvalStatus}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                filter === approvalStatus ? "border-moss bg-mint text-ink" : "border-ink/10 bg-white text-ink/60 hover:bg-paper"
              }`}
              type="button"
              onClick={() => setFilter(approvalStatus)}
            >
              {approvalStatus.toLowerCase()} {counts[approvalStatus]}
            </button>
          ))}
          <button
            className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
              filter === "ALL" ? "border-moss bg-mint text-ink" : "border-ink/10 bg-white text-ink/60 hover:bg-paper"
            }`}
            type="button"
            onClick={() => setFilter("ALL")}
          >
            all {approvals.length}
          </button>
        </div>
      </div>

      {error ? <p className="border-b border-ink/10 bg-clay/10 px-4 py-2 text-sm text-clay">{error}</p> : null}
      {status ? <p className="border-b border-ink/10 bg-mint px-4 py-2 text-sm text-ink">{status}</p> : null}

      <div className={compact ? "divide-y divide-ink/10" : "grid gap-3 p-4 lg:grid-cols-2"}>
        {visibleApprovals.length === 0 ? (
          <p className={compact ? "px-4 py-8 text-sm text-ink/55" : "text-sm text-ink/55"}>No approval requests in this view.</p>
        ) : null}
        {visibleApprovals.map((approval) => (
          <article
            key={approval.id}
            className={compact ? "px-4 py-4" : "rounded-md border border-ink/10 bg-paper p-3"}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge className={statusClassName[approval.status]}>{approval.status.toLowerCase()}</Badge>
                  <span className="text-xs font-medium uppercase text-ink/45">{targetLabel(approval.targetType)}</span>
                </div>
                <p className="truncate text-sm font-semibold text-ink">{approval.title}</p>
                <p className="mt-1 text-xs text-ink/50">
                  {approval.workspace.name} - requested by {approval.requester.name ?? approval.requester.email ?? "member"} -{" "}
                  {formatDate(approval.createdAt)}
                </p>
                {approval.reason ? <p className="mt-2 rounded-md bg-white px-2 py-1 text-xs text-ink/60">{approval.reason}</p> : null}
                {approval.reviewer ? (
                  <p className="mt-2 text-xs text-ink/45">
                    Reviewed by {approval.reviewer.name ?? approval.reviewer.email}{" "}
                    {approval.reviewedAt ? `on ${formatDate(approval.reviewedAt)}` : ""}
                  </p>
                ) : null}
              </div>
              {approval.status === "PENDING" ? (
                <div className="flex shrink-0 flex-col gap-2">
                  <Input
                    className="h-9 w-full min-w-48 bg-white text-xs"
                    placeholder="Reason for rejection"
                    value={reasonById[approval.id] ?? ""}
                    onChange={(event) =>
                      setReasonById((current) => ({
                        ...current,
                        [approval.id]: event.target.value
                      }))
                    }
                  />
                  <div className="flex gap-2">
                    <Button
                      className="h-9 px-3"
                      disabled={busyId === approval.id}
                      onClick={() => decide(approval.id, "APPROVED")}
                    >
                      {busyId === approval.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      Approve
                    </Button>
                    <Button
                      className="h-9 px-3"
                      variant="secondary"
                      disabled={busyId === approval.id}
                      onClick={() => decide(approval.id, "REJECTED")}
                    >
                      <XCircle className="h-4 w-4" />
                      Reject
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
