"use client";

import { useState } from "react";
import { Loader2, PlugZap, Plus, Trash2 } from "lucide-react";

import { CopyTextButton } from "@/components/dashboard/copy-text-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Channel = {
  id: string;
  name: string;
};

type Integration = {
  id: string;
  name: string;
  enabled: boolean;
  webhookUrl: string;
  channel?: Channel | null;
};

type IntegrationsPanelProps = {
  workspaceId: string;
  channels: Channel[];
  integrations: Integration[];
  canManage: boolean;
};

export function IntegrationsPanel({
  workspaceId,
  channels,
  integrations: initialIntegrations,
  canManage
}: IntegrationsPanelProps) {
  const [integrations, setIntegrations] = useState(initialIntegrations);
  const [name, setName] = useState("Incoming webhook");
  const [channelId, setChannelId] = useState(channels[0]?.id ?? "");
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState("");

  async function createIntegration() {
    setError("");
    const response = await fetch(`/api/workspaces/${workspaceId}/integrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, channelId })
    });
    const data = (await response.json().catch(() => null)) as { integration?: Integration; error?: string } | null;

    if (!response.ok || !data?.integration) {
      setError(data?.error ?? "Integration could not be created.");
      return;
    }

    setIntegrations((current) => [data.integration as Integration, ...current]);
  }

  async function deleteIntegration(integrationId: string) {
    setError("");
    setDeletingId(integrationId);
    const response = await fetch(`/api/integrations/${integrationId}`, {
      method: "DELETE"
    });
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    setDeletingId("");

    if (!response.ok) {
      setError(data?.error ?? "Webhook could not be deleted.");
      return;
    }

    setIntegrations((current) => current.filter((integration) => integration.id !== integrationId));
  }

  return (
    <div className="rounded-lg border border-ink/10 bg-white p-4">
      <div className="mb-4 flex items-center gap-2">
        <PlugZap className="h-4 w-4 text-moss" />
        <h2 className="text-sm font-semibold">Integrations</h2>
      </div>

      {canManage ? (
        <div className="mb-4 space-y-3 rounded-md border border-ink/10 bg-paper p-3">
          <div className="space-y-2">
            <Label htmlFor="integration-name">Name</Label>
            <Input id="integration-name" value={name} onChange={(event) => setName(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="integration-channel">Channel</Label>
            <select
              id="integration-channel"
              className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm outline-none"
              value={channelId}
              onChange={(event) => setChannelId(event.target.value)}
            >
              {channels.map((channel) => (
                <option key={channel.id} value={channel.id}>
                  # {channel.name}
                </option>
              ))}
            </select>
          </div>
          {error ? <p className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
          <Button className="w-full" onClick={createIntegration}>
            <Plus className="h-4 w-4" />
            Create webhook
          </Button>
        </div>
      ) : null}

      <div className="space-y-3">
        {integrations.length === 0 ? <p className="text-sm text-ink/55">No integrations yet.</p> : null}
        {integrations.map((integration) => (
          <div key={integration.id} className="rounded-md border border-ink/10 p-3 text-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div>
                <p className="font-medium">{integration.name}</p>
                <p className="text-xs text-ink/50">Posts to #{integration.channel?.name ?? "General"}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full bg-mint px-2 py-1 text-xs">
                  {integration.enabled ? "active" : "paused"}
                </span>
                {canManage ? (
                  <Button
                    aria-label={`Delete ${integration.name}`}
                    className="h-8 w-8 px-0"
                    variant="danger"
                    disabled={deletingId === integration.id}
                    onClick={() => deleteIntegration(integration.id)}
                  >
                    {deletingId === integration.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-paper px-2 py-1 text-xs">{integration.webhookUrl}</code>
              <CopyTextButton value={integration.webhookUrl} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
