import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";

import { auth } from "@/auth";
import { AccessRequestsPanel } from "@/components/dashboard/access-requests-panel";
import {
  getAccessRequestsForReview,
  getAccessRequestsForUser,
  getReviewableAccessWorkspaceIds
} from "@/lib/access-requests";

function serializeRequest(request: Awaited<ReturnType<typeof getAccessRequestsForUser>>[number]) {
  return {
    id: request.id,
    targetType: request.targetType,
    targetId: request.targetId,
    requestedRole: request.requestedRole,
    status: request.status,
    reason: request.reason,
    decisionReason: request.decisionReason,
    createdAt: request.createdAt.toISOString(),
    decidedAt: request.decidedAt?.toISOString() ?? null,
    workspace: request.workspace,
    file: request.file,
    requester: request.requester,
    reviewer: request.reviewer
  };
}

export default async function AccessRequestsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const [mine, reviewableWorkspaceIds] = await Promise.all([
    getAccessRequestsForUser(session.user.id),
    getReviewableAccessWorkspaceIds(session.user.id)
  ]);
  const reviewRequests = reviewableWorkspaceIds.length ? await getAccessRequestsForReview(session.user.id) : [];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <p className="flex items-center gap-2 text-sm font-medium text-moss">
          <KeyRound className="h-4 w-4" />
          Permission requests
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-ink">Access requests</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
          Members can request entry to a workspace or restricted file. Authorized reviewers can approve or reject here, and LETW records the decision in the audit trail.
        </p>
      </section>

      {reviewableWorkspaceIds.length ? (
        <AccessRequestsPanel
          title="Requests awaiting review"
          description="Approve only requests that match the member's role, branch, ministry, and current assignment."
          requests={reviewRequests.map(serializeRequest)}
          reviewMode
        />
      ) : null}

      <AccessRequestsPanel
        title="Your requests"
        description="Track access requests you have submitted for workspaces or files."
        requests={mine.map(serializeRequest)}
      />
    </div>
  );
}
