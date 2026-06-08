"use client";

import { useRouter } from "next/navigation";
import { Loader2, Trash2, UsersRound } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { assignableWorkspaceRoles, roleLabel, type AssignableWorkspaceRole } from "@/lib/roles";

type Member = {
  id: string;
  userId: string;
  role: AssignableWorkspaceRole | "EDITOR" | "VIEWER";
  user: {
    name?: string | null;
    email?: string | null;
  };
};

type MembersPanelProps = {
  workspaceId: string;
  members: Member[];
  canManage: boolean;
};

export function MembersPanel({ workspaceId, members, canManage }: MembersPanelProps) {
  const router = useRouter();
  const [busyMemberId, setBusyMemberId] = useState("");
  const [error, setError] = useState("");

  async function updateRole(memberId: string, role: AssignableWorkspaceRole) {
    setError("");
    setBusyMemberId(memberId);
    const response = await fetch(`/api/workspaces/${workspaceId}/members/${memberId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role })
    });
    setBusyMemberId("");

    if (response.ok) {
      router.refresh();
      return;
    }

    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    setError(data?.error ?? "Member role could not be updated.");
  }

  async function removeMember(memberId: string) {
    setError("");
    setBusyMemberId(memberId);
    const response = await fetch(`/api/workspaces/${workspaceId}/members/${memberId}`, {
      method: "DELETE"
    });
    setBusyMemberId("");

    if (response.ok) {
      router.refresh();
      return;
    }

    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    setError(data?.error ?? "Member could not be removed.");
  }

  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4">
      <div className="mb-4 flex items-center gap-2">
        <UsersRound className="h-4 w-4 text-moss" />
        <h2 className="text-sm font-semibold">Members</h2>
      </div>
      {error ? <p className="mb-3 rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
      <div className="space-y-3">
        {members.map((member) => (
          <div key={member.id} className="flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{member.user.name ?? member.user.email}</p>
              <p className="truncate text-xs text-ink/50">{member.user.email}</p>
            </div>
            {canManage ? (
              <div className="flex items-center gap-2">
                <select
                  className="h-9 rounded-md border border-ink/10 bg-white px-2 text-xs outline-none focus:border-moss focus:ring-2 focus:ring-moss/20"
                  value={member.role}
                  disabled={busyMemberId === member.id}
                  onChange={(event) => updateRole(member.id, event.target.value as AssignableWorkspaceRole)}
                >
                  {assignableWorkspaceRoles.map((role) => (
                    <option key={role} value={role}>
                      {roleLabel(role)}
                    </option>
                  ))}
                  {member.role === "EDITOR" ? <option value="EDITOR">editor (legacy)</option> : null}
                  {member.role === "VIEWER" ? <option value="VIEWER">user (legacy)</option> : null}
                </select>
                <Button
                  aria-label={`Remove ${member.user.name ?? member.user.email}`}
                  className="h-9 w-9 px-0"
                  variant="ghost"
                  disabled={busyMemberId === member.id}
                  onClick={() => removeMember(member.id)}
                >
                  {busyMemberId === member.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ) : (
              <Badge className="bg-wheat">{roleLabel(member.role)}</Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
