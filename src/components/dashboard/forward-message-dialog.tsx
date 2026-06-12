"use client";

import { useEffect, useMemo, useState } from "react";
import { Forward, Loader2, X } from "lucide-react";

import { ChatKind } from "@/components/dashboard/use-chat-collaboration";
import { Button } from "@/components/ui/button";

type DestinationData = {
  workspaces: Array<{
    id: string;
    name: string;
    channels: Array<{ id: string; name: string }>;
    directConversations: Array<{ id: string; name: string }>;
  }>;
  organizationRooms: Array<{ id: string; name: string }>;
};

type Destination = {
  kind: ChatKind;
  id: string;
  label: string;
};

export function ForwardMessageDialog({
  sourceKind,
  sourceMessageId,
  onClose,
  onForwarded,
  onError
}: {
  sourceKind: ChatKind;
  sourceMessageId: string;
  onClose: () => void;
  onForwarded?: (destination: { kind: ChatKind; id: string }, message: unknown) => void;
  onError: (message: string) => void;
}) {
  const [data, setData] = useState<DestinationData | null>(null);
  const [selected, setSelected] = useState("");
  const [isSending, setIsSending] = useState(false);

  useEffect(() => {
    fetch("/api/chat/destinations")
      .then(async (response) => {
        const body = (await response.json()) as DestinationData & { error?: string };
        if (!response.ok) throw new Error(body.error ?? "Destinations could not be loaded.");
        setData(body);
      })
      .catch((error: Error) => onError(error.message));
  }, [onError]);

  const destinations = useMemo<Destination[]>(() => {
    if (!data) return [];
    return [
      ...data.workspaces.flatMap((workspace) => [
        ...workspace.channels.map((channel) => ({
          kind: "channel" as const,
          id: channel.id,
          label: `${workspace.name} / #${channel.name}`
        })),
        ...workspace.directConversations.map((conversation) => ({
          kind: "direct" as const,
          id: conversation.id,
          label: `${workspace.name} / ${conversation.name}`
        }))
      ]),
      ...data.organizationRooms.map((room) => ({
        kind: "organization" as const,
        id: room.id,
        label: `Organization / ${room.name}`
      }))
    ];
  }, [data]);

  async function forward() {
    const destination = destinations.find((item) => `${item.kind}:${item.id}` === selected);
    if (!destination) return;

    setIsSending(true);
    const response = await fetch("/api/chat/forward", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceKind,
        sourceMessageId,
        destinationKind: destination.kind,
        destinationId: destination.id
      })
    });
    const body = (await response.json().catch(() => null)) as { message?: unknown; error?: string } | null;
    setIsSending(false);

    if (!response.ok || !body?.message) {
      onError(body?.error ?? "Message could not be forwarded.");
      return;
    }

    onForwarded?.({ kind: destination.kind, id: destination.id }, body.message);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-lg border border-ink/10 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
          <div className="flex items-center gap-2">
            <Forward className="h-4 w-4 text-moss" />
            <h2 className="font-semibold">Forward message</h2>
          </div>
          <button aria-label="Close" className="p-1 text-ink/55 hover:text-ink" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-4 p-4">
          <p className="text-sm text-ink/60">
            Choose any channel, member conversation, or organization room you are authorized to use.
          </p>
          <select
            className="h-11 w-full rounded-md border border-ink/15 bg-white px-3 text-sm outline-none focus:border-moss"
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            <option value="">{data ? "Select destination" : "Loading destinations..."}</option>
            {destinations.map((destination) => (
              <option key={`${destination.kind}:${destination.id}`} value={`${destination.kind}:${destination.id}`}>
                {destination.label}
              </option>
            ))}
          </select>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button disabled={!selected || isSending} onClick={forward}>
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Forward className="h-4 w-4" />}
              Forward
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
