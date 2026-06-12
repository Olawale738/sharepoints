import { redirect } from "next/navigation";
import { Eye, Files, Hash, ShieldCheck, UsersRound } from "lucide-react";
import { WorkspaceRole } from "@prisma/client";

import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { defaultPermissionsForRole, getRolePermissions, hasAnyWorkspaceAdminRole } from "@/lib/rbac";

const previewRoles = [WorkspaceRole.LEADER, WorkspaceRole.MODERATOR, WorkspaceRole.USER] as const;

export default async function AdminRolePreviewPage({
  searchParams
}: {
  searchParams: Promise<{ workspaceId?: string; role?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (!(await hasAnyWorkspaceAdminRole(session.user.id))) redirect("/dashboard");
  const query = await searchParams;
  const workspaces = await prisma.workspace.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { name: "asc" }
  });
  const workspaceId = workspaces.some((workspace) => workspace.id === query.workspaceId)
    ? query.workspaceId!
    : workspaces[0]?.id;
  const role = previewRoles.includes(query.role as (typeof previewRoles)[number])
    ? (query.role as (typeof previewRoles)[number])
    : WorkspaceRole.USER;
  const workspace = workspaceId
    ? await prisma.workspace.findUnique({
        where: { id: workspaceId },
        include: {
          files: {
            where: { deletedAt: null, approvalStatus: "APPROVED" },
            select: { id: true, fileName: true, size: true },
            take: 10,
            orderBy: { createdAt: "desc" }
          },
          chatChannels: {
            select: { id: true, name: true, _count: { select: { messages: true } } },
            orderBy: { createdAt: "asc" }
          },
          _count: { select: { members: true, tasks: true, meetings: true } }
        }
      })
    : null;
  const permissions = workspaceId
    ? await getRolePermissions(workspaceId, role)
    : defaultPermissionsForRole(role);
  if (workspaceId) {
    await prisma.adminRolePreview.create({
      data: { adminId: session.user.id, workspaceId, previewRole: role }
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-medium text-moss"><Eye className="h-4 w-4" />Safe role preview</p>
        <h1 className="mt-2 text-3xl font-semibold">See the workspace as a role</h1>
        <p className="mt-2 text-sm text-ink/60">This preview never signs in as another person and cannot perform actions.</p>
        <form className="mt-4 grid gap-3 sm:grid-cols-[1fr_14rem_auto]">
          <select name="workspaceId" defaultValue={workspaceId} className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
            {workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select name="role" defaultValue={role} className="h-10 rounded-md border border-ink/10 bg-white px-3 text-sm">
            {previewRoles.map((item) => <option key={item} value={item}>{item.toLowerCase()}</option>)}
          </select>
          <button className="h-10 rounded-md bg-moss px-4 text-sm font-medium text-white">Preview</button>
        </form>
      </section>

      {workspace ? (
        <>
          <section className="rounded-lg border border-moss/25 bg-mint/35 px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="h-4 w-4 text-moss" />Previewing {workspace.name} as <Badge>{role.toLowerCase()}</Badge></p>
          </section>
          <section className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-ink/10 bg-white p-4"><UsersRound className="h-5 w-5 text-moss" /><p className="mt-3 text-2xl font-semibold">{workspace._count.members}</p><p className="text-sm text-ink/55">Visible member seats</p></div>
            <div className="rounded-lg border border-ink/10 bg-white p-4"><Files className="h-5 w-5 text-moss" /><p className="mt-3 text-2xl font-semibold">{workspace.files.length}</p><p className="text-sm text-ink/55">Recent approved files</p></div>
            <div className="rounded-lg border border-ink/10 bg-white p-4"><Hash className="h-5 w-5 text-moss" /><p className="mt-3 text-2xl font-semibold">{workspace.chatChannels.length}</p><p className="text-sm text-ink/55">Workspace channels</p></div>
          </section>
          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-lg border border-ink/10 bg-white p-4">
              <h2 className="font-semibold">Role capabilities</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                {Object.entries(permissions).map(([key, allowed]) => (
                  <p key={key} className={`rounded-md px-3 py-2 ${allowed ? "bg-mint/60 text-ink" : "bg-ink/[0.04] text-ink/45"}`}>
                    {key.replace(/^can/, "").replace(/([A-Z])/g, " $1").trim()}: {allowed ? "allowed" : "hidden"}
                  </p>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-ink/10 bg-white p-4">
              <h2 className="font-semibold">Content this role sees</h2>
              <div className="mt-3 divide-y divide-ink/10">
                {workspace.files.map((file) => <p key={file.id} className="py-2 text-sm">{file.fileName}</p>)}
                {workspace.chatChannels.map((channel) => <p key={channel.id} className="py-2 text-sm"># {channel.name} · {channel._count.messages} messages</p>)}
              </div>
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
