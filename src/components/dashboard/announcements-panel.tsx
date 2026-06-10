"use client";

import { FormEvent, useState } from "react";
import { Megaphone, Pin, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/utils";

type Announcement = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  approvalStatus?: "PENDING" | "APPROVED" | "REJECTED";
  rejectedReason?: string | null;
  createdAt: string;
  author: {
    name?: string | null;
    email?: string | null;
  };
};

const approvalClassName: Record<NonNullable<Announcement["approvalStatus"]>, string> = {
  PENDING: "bg-wheat",
  APPROVED: "bg-mint",
  REJECTED: "bg-clay/10 text-clay"
};

type AnnouncementsPanelProps = {
  workspaceId: string;
  announcements: Announcement[];
  canCreate: boolean;
};

export function AnnouncementsPanel({
  workspaceId,
  announcements: initialAnnouncements,
  canCreate
}: AnnouncementsPanelProps) {
  const [announcements, setAnnouncements] = useState(initialAnnouncements);
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function createAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch(`/api/workspaces/${workspaceId}/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: String(formData.get("title")),
        body: String(formData.get("body")),
        pinned: Boolean(formData.get("pinned"))
      })
    });

    setIsSubmitting(false);
    const data = (await response.json().catch(() => null)) as {
      announcement?: Announcement;
      error?: string;
    } | null;

    if (!response.ok || !data?.announcement) {
      setError(data?.error ?? "Announcement could not be posted.");
      return;
    }

    setAnnouncements((current) => [data.announcement as Announcement, ...current]);
    form.reset();
  }

  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4">
      <div className="mb-4 flex items-center gap-2">
        <Megaphone className="h-4 w-4 text-moss" />
        <h2 className="text-sm font-semibold">Announcements</h2>
      </div>

      {canCreate ? (
        <form className="mb-4 space-y-3 rounded-md border border-ink/10 bg-paper p-3" onSubmit={createAnnouncement}>
          <Input name="title" placeholder="Announcement title" required />
          <Textarea name="body" placeholder="Post an update for this workspace" rows={3} required />
          <label className="flex items-center gap-2 text-sm text-ink/70">
            <input className="h-4 w-4 accent-moss" name="pinned" type="checkbox" />
            Pin announcement
          </label>
          {error ? <p className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
          <Button type="submit" disabled={isSubmitting}>
            <Send className="h-4 w-4" />
            Post
          </Button>
        </form>
      ) : null}

      <div className="space-y-3">
        {announcements.length === 0 ? <p className="text-sm text-ink/55">No announcements yet.</p> : null}
        {announcements.map((announcement) => (
          <article key={announcement.id} className="rounded-md border border-ink/10 bg-paper px-3 py-3 text-sm">
            <div className="mb-2 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-ink">{announcement.title}</p>
                <p className="text-xs text-ink/50">
                  {announcement.author.name ?? announcement.author.email} - {formatDate(announcement.createdAt)}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {announcement.approvalStatus ? (
                  <Badge className={approvalClassName[announcement.approvalStatus]}>
                    {announcement.approvalStatus.toLowerCase()}
                  </Badge>
                ) : null}
                {announcement.pinned ? <Pin className="h-4 w-4 text-moss" /> : null}
              </div>
            </div>
            {announcement.rejectedReason ? (
              <p className="mb-2 rounded-md bg-clay/10 px-2 py-1 text-xs text-clay">{announcement.rejectedReason}</p>
            ) : null}
            <p className="whitespace-pre-wrap text-ink/75">{announcement.body}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
