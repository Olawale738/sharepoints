"use client";

import { FormEvent, useEffect, useState } from "react";
import { BellRing, Loader2, Save } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Preference = {
  pushEnabled: boolean;
  browserEnabled: boolean;
  emailMentions: boolean;
  emailTasks: boolean;
  emailMeetings: boolean;
  emailApprovals: boolean;
  digest: "IMMEDIATE" | "DAILY" | "WEEKLY" | "NEVER";
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  timeZone: string;
};

export function NotificationSettingsPanel() {
  const [preference, setPreference] = useState<Preference | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/notifications")
      .then((response) => response.json())
      .then((data: { preference?: Preference }) => setPreference(data.preference ?? null))
      .catch(() => undefined);
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pushEnabled: values.get("pushEnabled") === "on",
        browserEnabled: values.get("browserEnabled") === "on",
        emailMentions: values.get("emailMentions") === "on",
        emailTasks: values.get("emailTasks") === "on",
        emailMeetings: values.get("emailMeetings") === "on",
        emailApprovals: values.get("emailApprovals") === "on",
        digest: String(values.get("digest")),
        quietHoursStart: String(values.get("quietHoursStart") ?? "") || null,
        quietHoursEnd: String(values.get("quietHoursEnd") ?? "") || null,
        timeZone: String(values.get("timeZone") ?? "Europe/London")
      })
    });
    setSaving(false);
    setMessage(response.ok ? "Notification settings saved." : "Notification settings could not be saved.");
  }

  if (!preference) {
    return <p className="flex items-center gap-2 text-sm text-ink/55"><Loader2 className="h-4 w-4 animate-spin" />Loading notification settings</p>;
  }

  return (
    <form className="max-w-3xl rounded-lg border border-ink/10 bg-white p-5" onSubmit={save}>
      <div className="mb-4 flex items-center gap-2">
        <BellRing className="h-4 w-4 text-moss" />
        <h2 className="font-semibold">Notifications and quiet hours</h2>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["pushEnabled", "Mobile push", preference.pushEnabled],
          ["browserEnabled", "Browser alerts", preference.browserEnabled],
          ["emailMentions", "Email mentions", preference.emailMentions],
          ["emailTasks", "Email task reminders", preference.emailTasks],
          ["emailMeetings", "Email meeting reminders", preference.emailMeetings],
          ["emailApprovals", "Email approval requests", preference.emailApprovals]
        ].map(([name, label, checked]) => (
          <label key={String(name)} className="flex items-center gap-2 rounded-md border border-ink/10 px-3 py-2 text-sm">
            <input name={String(name)} type="checkbox" defaultChecked={Boolean(checked)} />
            {String(label)}
          </label>
        ))}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-2">
          <Label htmlFor="notification-digest">Email digest</Label>
          <select id="notification-digest" name="digest" defaultValue={preference.digest} className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm">
            <option value="IMMEDIATE">Immediate</option><option value="DAILY">Daily</option><option value="WEEKLY">Weekly</option><option value="NEVER">Never</option>
          </select>
        </div>
        <div className="space-y-2"><Label htmlFor="quiet-start">Quiet from</Label><Input id="quiet-start" name="quietHoursStart" type="time" defaultValue={preference.quietHoursStart ?? ""} /></div>
        <div className="space-y-2"><Label htmlFor="quiet-end">Quiet until</Label><Input id="quiet-end" name="quietHoursEnd" type="time" defaultValue={preference.quietHoursEnd ?? ""} /></div>
        <div className="space-y-2"><Label htmlFor="notification-timezone">Time zone</Label><Input id="notification-timezone" name="timeZone" defaultValue={preference.timeZone} /></div>
      </div>
      {message ? <p className="mt-4 rounded-md bg-mint/60 px-3 py-2 text-sm">{message}</p> : null}
      <Button className="mt-4" type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save notifications</Button>
    </form>
  );
}
