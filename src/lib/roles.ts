export type WorkspaceRoleValue = "ADMIN" | "LEADER" | "MODERATOR" | "USER" | "EDITOR" | "VIEWER" | string;

const labels: Record<string, string> = {
  ADMIN: "admin",
  LEADER: "leader",
  MODERATOR: "moderator",
  USER: "user",
  EDITOR: "editor (legacy)",
  VIEWER: "user"
};

export const assignableWorkspaceRoles = ["ADMIN", "LEADER", "MODERATOR", "USER"] as const;

export type AssignableWorkspaceRole = (typeof assignableWorkspaceRoles)[number];

export function roleLabel(role: WorkspaceRoleValue) {
  return labels[String(role)] ?? String(role).toLowerCase();
}

export function roleDashboardLabel(role: WorkspaceRoleValue) {
  if (role === "EDITOR") {
    return "Leader dashboard";
  }

  if (role === "VIEWER") {
    return "User dashboard";
  }

  return `${roleLabel(role).replace(" (legacy)", "")} dashboard`;
}
