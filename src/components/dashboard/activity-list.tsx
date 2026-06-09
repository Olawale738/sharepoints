import { Clock3 } from "lucide-react";

import { formatDate } from "@/lib/utils";

type ActivityItem = {
  id: string;
  action: string;
  createdAt: string;
  user: {
    name?: string | null;
    email?: string | null;
  } | null;
};

const labels: Record<string, string> = {
  "workspace.created": "created this workspace",
  "workspace.user_joined": "joined the workspace",
  "folder.created": "created a folder",
  "file.uploaded": "uploaded a file",
  "file.deleted": "deleted a file",
  "workspace.member_updated": "updated a member role",
  "workspace.member_removed": "removed a member",
  "workspace.role_permissions_updated": "updated role permissions",
  "chat.channel_created": "created a chat channel",
  "chat.message_created": "sent a message",
  "chat.message_edited": "edited a message",
  "chat.message_deleted": "deleted a message",
  "chat.direct_message_created": "sent a direct message",
  "chat.direct_message_edited": "edited a direct message",
  "chat.direct_message_deleted": "deleted a direct message",
  "chat.org_message_created": "sent an organization message",
  "chat.org_message_edited": "edited an organization message",
  "chat.org_message_deleted": "deleted an organization message",
  "integration.created": "created an integration",
  "integration.webhook_received": "received a webhook",
  "announcement.created": "posted an announcement",
  "task.created": "created a task",
  "task.updated": "updated a task",
  "task.deleted": "deleted a task",
  "meeting.scheduled": "scheduled a video meeting",
  "meeting.cancelled": "cancelled a video meeting",
  "meeting.cleared": "cleared a cancelled video meeting",
  "meeting.response_updated": "responded to a video meeting",
  "file.share_link_created": "created a file share link",
  "company_invitation.resent": "resent an access invitation",
  "company_invitation.cleared": "cleared a revoked invitation log"
};

export function ActivityList({ items }: { items: ActivityItem[] }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4">
      <div className="mb-4 flex items-center gap-2">
        <Clock3 className="h-4 w-4 text-moss" />
        <h2 className="text-sm font-semibold">Activity</h2>
      </div>
      <div className="space-y-3">
        {items.length === 0 ? <p className="text-sm text-ink/55">No activity yet.</p> : null}
        {items.map((item) => (
          <div key={item.id} className="text-sm">
            <p className="text-ink">
              <span className="font-medium">{item.user?.name ?? item.user?.email ?? "Someone"}</span>{" "}
              {labels[item.action] ?? item.action}
            </p>
            <p className="text-xs text-ink/50">{formatDate(item.createdAt)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
