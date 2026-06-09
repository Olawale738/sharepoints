import { CheckCircle2, IdCard, ShieldCheck, UsersRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { roleLabel } from "@/lib/roles";
import { formatDate } from "@/lib/utils";

type RoleSummary = {
  role: string;
  count: number;
};

type UserAccessPassportProps = {
  user: {
    name?: string | null;
    email?: string | null;
    createdAt?: string | null;
  };
  status: "ACTIVE" | "SUSPENDED" | "REVOKED" | "DELETED";
  invitation?: {
    acceptedAt?: string | null;
    createdAt: string;
    invitedBy?: {
      name?: string | null;
      email?: string | null;
    } | null;
  } | null;
  roleSummary: RoleSummary[];
  workspaceCount: number;
  assignedOpenTasksCount: number;
  uploadedFilesCount: number;
};

const statusClassName: Record<UserAccessPassportProps["status"], string> = {
  ACTIVE: "bg-mint",
  SUSPENDED: "bg-wheat",
  REVOKED: "bg-clay/10 text-clay",
  DELETED: "bg-ink/10 text-ink/60"
};

export function UserAccessPassport({
  user,
  status,
  invitation,
  roleSummary,
  workspaceCount,
  assignedOpenTasksCount,
  uploadedFilesCount
}: UserAccessPassportProps) {
  return (
    <section className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <IdCard className="h-4 w-4 text-moss" />
            My LETW access passport
          </p>
          <p className="mt-1 truncate text-sm text-ink/60">{user.name ?? user.email ?? "Registered LETW user"}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge className={statusClassName[status]}>{status.toLowerCase()}</Badge>
            {invitation ? <Badge className="bg-mint">invited @letw.org</Badge> : <Badge className="bg-wheat">invitation check needed</Badge>}
            {roleSummary.length ? (
              roleSummary.map((role) => (
                <Badge key={role.role} className={role.role === "ADMIN" ? "bg-wheat" : undefined}>
                  {role.count} {roleLabel(role.role)}
                </Badge>
              ))
            ) : (
              <Badge className="bg-paper">no workspace role yet</Badge>
            )}
          </div>
        </div>

        <div className="grid gap-2 text-xs sm:grid-cols-3 lg:w-[26rem]">
          <div className="rounded-md border border-ink/10 bg-paper px-3 py-2">
            <p className="font-medium text-ink">{workspaceCount}</p>
            <p className="text-ink/50">Workspaces</p>
          </div>
          <div className="rounded-md border border-ink/10 bg-paper px-3 py-2">
            <p className="font-medium text-ink">{assignedOpenTasksCount}</p>
            <p className="text-ink/50">Assigned open tasks</p>
          </div>
          <div className="rounded-md border border-ink/10 bg-paper px-3 py-2">
            <p className="font-medium text-ink">{uploadedFilesCount}</p>
            <p className="text-ink/50">Uploaded files</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <div className="rounded-md border border-ink/10 bg-paper p-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-ink">
            <ShieldCheck className="h-4 w-4 text-moss" />
            Access rule
          </p>
          <p className="mt-1 text-xs text-ink/55">
            LETW is invitation-only. Only invited @letw.org accounts can register, sign in, and use workspace services.
          </p>
        </div>
        <div className="rounded-md border border-ink/10 bg-paper p-3 text-sm">
          <p className="flex items-center gap-2 font-medium text-ink">
            <CheckCircle2 className="h-4 w-4 text-moss" />
            Invitation status
          </p>
          <p className="mt-1 text-xs text-ink/55">
            {invitation
              ? `Invited ${formatDate(invitation.createdAt)}${
                  invitation.invitedBy ? ` by ${invitation.invitedBy.name ?? invitation.invitedBy.email}` : ""
                }${
                  invitation.acceptedAt ? `, accepted ${formatDate(invitation.acceptedAt)}` : ", not accepted yet"
                }.`
              : "No active invitation record was found for this email."}
          </p>
        </div>
      </div>

      {workspaceCount === 0 ? (
        <div className="mt-3 rounded-md border border-wheat bg-wheat/40 p-3 text-sm text-ink">
          <p className="flex items-center gap-2 font-medium">
            <UsersRound className="h-4 w-4" />
            You are registered, but not yet assigned to a workspace.
          </p>
          <p className="mt-1 text-xs text-ink/60">Ask an admin or leader to add you to the right workspace or give you a join code.</p>
        </div>
      ) : null}
    </section>
  );
}
