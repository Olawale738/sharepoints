"use client";

import { useState } from "react";
import { Loader2, SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { roleLabel } from "@/lib/roles";

type RolePermission = {
  role: "LEADER" | "MODERATOR";
  canUploadFiles: boolean;
  canDeleteFiles: boolean;
  canCreateFolders: boolean;
  canCreateChannels: boolean;
  canSendMessages: boolean;
  canManageMembers: boolean;
  canManageIntegrations: boolean;
  canViewActivity: boolean;
  canClearActivity: boolean;
  canCreateAnnouncements: boolean;
  canManageTasks: boolean;
  canScheduleMeetings: boolean;
  canCreateShareLinks: boolean;
  canUseWhatsAppCommandBot: boolean;
  canManageDigitalSignatures: boolean;
  canManageEvidenceVault: boolean;
  canViewExecutiveBriefing: boolean;
  canDeleteReports: boolean;
  canClearReportLogs: boolean;
  canManagePresidentialActions: boolean;
  canManageMediaArchive: boolean;
  canUseExecutiveSecretary: boolean;
  canApproveContent: boolean;
  canClassifyDocuments: boolean;
  canViewPresidentDesk: boolean;
  canManageOfficialRegistry: boolean;
  canViewBranchCompliance: boolean;
  canRunSuperAdminRecovery: boolean;
};

type PermissionKey = Exclude<keyof RolePermission, "role">;

type RolePermissionsPanelProps = {
  workspaceId: string;
  permissions: RolePermission[];
};

const permissionLabels: Array<{ key: PermissionKey; label: string }> = [
  { key: "canUploadFiles", label: "Upload files" },
  { key: "canDeleteFiles", label: "Delete files" },
  { key: "canCreateFolders", label: "Create folders" },
  { key: "canCreateChannels", label: "Create channels" },
  { key: "canSendMessages", label: "Send chat messages" },
  { key: "canManageMembers", label: "Manage members" },
  { key: "canManageIntegrations", label: "Manage integrations" },
  { key: "canViewActivity", label: "View activity" },
  { key: "canClearActivity", label: "Clear activity logs" },
  { key: "canCreateAnnouncements", label: "Create announcements" },
  { key: "canManageTasks", label: "Manage tasks" },
  { key: "canScheduleMeetings", label: "Schedule audio/video calls" },
  { key: "canCreateShareLinks", label: "Create share links" },
  { key: "canUseWhatsAppCommandBot", label: "Use WhatsApp admin command bot" },
  { key: "canManageDigitalSignatures", label: "Request and manage digital signatures" },
  { key: "canManageEvidenceVault", label: "Manage confidential evidence vault" },
  { key: "canViewExecutiveBriefing", label: "View executive briefing room" },
  { key: "canDeleteReports", label: "Delete executive reports" },
  { key: "canClearReportLogs", label: "Clear report activity logs" },
  { key: "canManagePresidentialActions", label: "Manage presidential action desk" },
  { key: "canManageMediaArchive", label: "Manage secure media archive" },
  { key: "canUseExecutiveSecretary", label: "Use AI executive secretary" },
  { key: "canApproveContent", label: "Approve files, meetings, tasks, and announcements" },
  { key: "canClassifyDocuments", label: "Classify and restrict documents" },
  { key: "canViewPresidentDesk", label: "View president approval desk" },
  { key: "canManageOfficialRegistry", label: "Manage official seal registry" },
  { key: "canViewBranchCompliance", label: "View branch compliance dashboard" },
  { key: "canRunSuperAdminRecovery", label: "Run protected admin recovery" }
];

export function RolePermissionsPanel({ workspaceId, permissions: initialPermissions }: RolePermissionsPanelProps) {
  const [permissions, setPermissions] = useState(initialPermissions);
  const [savingRole, setSavingRole] = useState("");
  const [error, setError] = useState("");
  const [savedRole, setSavedRole] = useState("");

  function toggle(role: RolePermission["role"], key: PermissionKey) {
    setSavedRole("");
    setPermissions((current) =>
      current.map((item) => (item.role === role ? { ...item, [key]: !item[key] } : item))
    );
  }

  async function save(role: RolePermission["role"]) {
    const nextPermissions = permissions.find((item) => item.role === role);

    if (!nextPermissions) {
      return;
    }

    setError("");
    setSavedRole("");
    setSavingRole(role);

    const response = await fetch(`/api/workspaces/${workspaceId}/permissions`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(nextPermissions)
    });

    setSavingRole("");
    const data = (await response.json().catch(() => null)) as {
      permissions?: RolePermission;
      error?: string;
    } | null;

    if (!response.ok || !data?.permissions) {
      setError(data?.error ?? "Permissions could not be saved.");
      return;
    }

    setPermissions((current) => current.map((item) => (item.role === role ? data.permissions as RolePermission : item)));
    setSavedRole(role);
  }

  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4">
      <div className="mb-4 flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-moss" />
        <h2 className="text-sm font-semibold">Role permissions</h2>
      </div>
      {error ? <p className="mb-3 rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
      <div className="space-y-4">
        {permissions.map((item) => (
          <div key={item.role} className="rounded-md border border-ink/10 bg-paper p-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">{roleLabel(item.role)}</p>
                <p className="text-xs text-ink/50">
                  Admins decide what this role can do inside this workspace.
                </p>
              </div>
              <Button className="h-9" onClick={() => save(item.role)} disabled={savingRole === item.role}>
                {savingRole === item.role ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save
              </Button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {permissionLabels.map((permission) => (
                <label
                  key={permission.key}
                  className="flex items-center gap-2 rounded-md border border-ink/10 bg-white px-3 py-2 text-sm"
                >
                  <input
                    className="h-4 w-4 accent-moss"
                    type="checkbox"
                    checked={item[permission.key]}
                    onChange={() => toggle(item.role, permission.key)}
                  />
                  {permission.label}
                </label>
              ))}
            </div>
            {savedRole === item.role ? <p className="mt-3 text-xs text-moss">Permissions saved.</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
