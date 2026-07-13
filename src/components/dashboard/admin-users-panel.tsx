"use client";

import { useMemo, useState } from "react";
import { Loader2, RotateCcw, Search, ShieldOff, Trash2, UserMinus, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

type AdminUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  createdAt: string;
  suspendedAt?: string | null;
  accessRevokedAt?: string | null;
  deletedAt?: string | null;
  isAdmin: boolean;
  protectedAdmin?: boolean;
  status: "ACTIVE" | "SUSPENDED" | "REVOKED" | "DELETED";
  _count: {
    workspaceMemberships: number;
    uploadedFiles: number;
    activityLogs: number;
  };
};

type AdminUsersPanelProps = {
  currentUserId: string;
  users: AdminUser[];
};

const statusClassName: Record<AdminUser["status"], string> = {
  ACTIVE: "bg-mint",
  SUSPENDED: "bg-wheat",
  REVOKED: "bg-clay/10 text-clay",
  DELETED: "bg-ink/10 text-ink/60"
};

export function AdminUsersPanel({ currentUserId, users: initialUsers }: AdminUsersPanelProps) {
  const [users, setUsers] = useState(initialUsers);
  const [busyUserId, setBusyUserId] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [query, setQuery] = useState("");
  const userStats = useMemo(
    () =>
      users.reduce(
        (stats, user) => ({
          ...stats,
          [user.status]: stats[user.status] + 1
        }),
        { ACTIVE: 0, SUSPENDED: 0, REVOKED: 0, DELETED: 0 } as Record<AdminUser["status"], number>
      ),
    [users]
  );
  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return users;
    }

    return users.filter((user) =>
      [
        user.name ?? "",
        user.email ?? "",
        user.status,
        user.protectedAdmin ? "protected president super admin" : user.isAdmin ? "admin" : "",
        `${user._count.workspaceMemberships} workspaces`,
        `${user._count.uploadedFiles} files`
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [query, users]);

  async function updateUser(userId: string, action: "SUSPEND" | "RESTORE" | "REVOKE" | "DELETE") {
    setError("");
    setStatus("");
    setBusyUserId(userId);

    const response = await fetch(`/api/admin/users/${userId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ action })
    });
    const data = (await response.json().catch(() => null)) as { user?: AdminUser; error?: string } | null;
    setBusyUserId("");

    if (!response.ok || !data?.user) {
      setError(data?.error ?? "User action failed.");
      return;
    }

    setUsers((current) => current.map((user) => (user.id === data.user?.id ? data.user : user)));
    setStatus(`${data.user.email ?? "User"} updated.`);
  }

  return (
    <div className="rounded-lg border border-ink/10 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <UsersRound className="h-4 w-4 text-moss" />
          <h2 className="text-sm font-semibold">User administration</h2>
        </div>
        <Badge>{users.length}</Badge>
      </div>
      <div className="border-b border-ink/10 bg-paper px-4 py-3">
        <div className="grid gap-2 text-xs sm:grid-cols-4">
          {(Object.keys(userStats) as AdminUser["status"][]).map((userStatus) => (
            <div key={userStatus} className="rounded-md border border-ink/10 bg-white px-3 py-2">
              <p className="font-medium text-ink">{userStats[userStatus]}</p>
              <p className="text-ink/50">{userStatus.toLowerCase()}</p>
            </div>
          ))}
        </div>
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
          <Input
            className="bg-white pl-9"
            placeholder="Search registered users by name, email, status, or admin"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      </div>

      {error ? <p className="border-b border-ink/10 bg-clay/10 px-4 py-2 text-sm text-clay">{error}</p> : null}
      {status ? <p className="border-b border-ink/10 bg-mint px-4 py-2 text-sm text-ink">{status}</p> : null}

      <div className="divide-y divide-ink/10">
        {users.length === 0 ? <p className="px-4 py-8 text-sm text-ink/55">No users yet.</p> : null}
        {users.length > 0 && filteredUsers.length === 0 ? (
          <p className="px-4 py-8 text-sm text-ink/55">No registered users match that search.</p>
        ) : null}
        {filteredUsers.map((user) => {
          const isBusy = busyUserId === user.id;
          const isCurrentUser = currentUserId === user.id;
          const isDeleted = user.status === "DELETED";
          const canRestore = user.status === "SUSPENDED" || user.status === "REVOKED";
          const protectedAdmin = Boolean(user.protectedAdmin);
          const showRevoke = !isDeleted && !protectedAdmin && !user.isAdmin;
          const showSuspend = user.status === "ACTIVE" && !protectedAdmin;
          const showDelete = !isDeleted && !protectedAdmin;

          return (
            <div key={user.id} className="px-4 py-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium text-ink">{user.name ?? user.email ?? "Unnamed user"}</p>
                    <Badge className={statusClassName[user.status]}>{user.status.toLowerCase()}</Badge>
                    {user.isAdmin ? <Badge className="bg-moss text-white">admin</Badge> : null}
                    {protectedAdmin ? <Badge className="bg-ink text-white">protected president</Badge> : null}
                    {isCurrentUser ? <Badge className="bg-wheat">you</Badge> : null}
                  </div>
                  <p className="mt-1 truncate text-sm text-ink/55">{user.email ?? "No email"}</p>
                  <p className="mt-1 text-xs text-ink/45">
                    Joined {formatDate(user.createdAt)} - {user._count.workspaceMemberships} workspaces -{" "}
                    {user._count.uploadedFiles} files
                  </p>
                </div>

                <div className="flex shrink-0 flex-wrap gap-2">
                  {canRestore ? (
                    <Button
                      className="h-9"
                      variant="secondary"
                      disabled={isBusy || isCurrentUser}
                      onClick={() => updateUser(user.id, "RESTORE")}
                    >
                      {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                      Restore
                    </Button>
                  ) : null}
                  {showSuspend ? (
                    <Button
                      className="h-9"
                      variant="secondary"
                      disabled={isBusy || isCurrentUser}
                      onClick={() => updateUser(user.id, "SUSPEND")}
                    >
                      {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
                      Suspend
                    </Button>
                  ) : null}
                  {showRevoke ? (
                    <Button
                      className="h-9"
                      variant="secondary"
                      disabled={isBusy || isCurrentUser}
                      onClick={() => updateUser(user.id, "REVOKE")}
                    >
                      {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserMinus className="h-4 w-4" />}
                      Revoke
                    </Button>
                  ) : null}
                  {showDelete ? (
                    <Button
                      className="h-9"
                      variant="danger"
                      disabled={isBusy || isCurrentUser}
                      onClick={() => updateUser(user.id, "DELETE")}
                    >
                      {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      Delete
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
