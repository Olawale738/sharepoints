"use client";

import { Circle, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";

import { formatDate } from "@/lib/utils";

type PresenceMember = {
  userId: string;
  name: string;
  status: string;
  lastSeenAt?: string | null;
};

export function WorkspacePresence({ workspaceId }: { workspaceId: string }) {
  const [members, setMembers] = useState<PresenceMember[]>([]);

  useEffect(() => {
    async function loadPresence() {
      const response = await fetch(`/api/presence?workspaceId=${workspaceId}`);
      if (!response.ok) return;
      const data = (await response.json()) as { members: PresenceMember[] };
      setMembers(data.members);
    }

    void loadPresence();
    const interval = window.setInterval(loadPresence, 30_000);
    return () => window.clearInterval(interval);
  }, [workspaceId]);

  const online = members.filter((member) => member.status !== "offline");

  return (
    <section className="rounded-lg border border-ink/10 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <UsersRound className="h-4 w-4 text-moss" />
          Presence
        </h2>
        <span className="text-xs text-ink/45">{online.length} online</span>
      </div>
      <div className="space-y-2">
        {members.slice(0, 12).map((member) => {
          const isOnline = member.status !== "offline";
          return (
            <div key={member.userId} className="flex items-center gap-2 text-sm">
              <Circle
                className={`h-2.5 w-2.5 shrink-0 fill-current ${isOnline ? "text-moss" : "text-ink/20"}`}
              />
              <span className="min-w-0 flex-1 truncate">{member.name}</span>
              <span className="text-[11px] text-ink/40">
                {isOnline ? member.status : member.lastSeenAt ? formatDate(member.lastSeenAt) : "offline"}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
