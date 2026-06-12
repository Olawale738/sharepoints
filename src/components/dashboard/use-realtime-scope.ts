"use client";

import { useEffect, useRef, useState } from "react";
import * as Ably from "ably";

import { ChatKind } from "@/components/dashboard/use-chat-collaboration";

type RealtimeStatus = "connecting" | "live" | "fallback";

export function useRealtimeScope(
  kind: ChatKind | "notifications",
  scopeId: string,
  onEvent: (event: string, data: unknown) => void
) {
  const callbackRef = useRef(onEvent);
  const [status, setStatus] = useState<RealtimeStatus>("connecting");

  callbackRef.current = onEvent;

  useEffect(() => {
    if (!scopeId) return;
    const activeScopeId = scopeId;

    const client = new Ably.Realtime({
      authUrl: "/api/realtime/token",
      echoMessages: false
    });
    const channel = client.channels.get(`letw:${kind}:${activeScopeId}`);
    let active = true;

    client.connection.on("connected", () => active && setStatus("live"));
    client.connection.on("failed", () => active && setStatus("fallback"));
    client.connection.on("suspended", () => active && setStatus("fallback"));
    channel.subscribe((message) => callbackRef.current(message.name ?? "message", message.data)).catch(() => {
      if (active) setStatus("fallback");
    });

    return () => {
      active = false;
      void channel.unsubscribe();
      client.close();
    };
  }, [kind, scopeId]);

  return status;
}
