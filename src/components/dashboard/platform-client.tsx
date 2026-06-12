"use client";

import { useEffect } from "react";

function deviceKey() {
  const existing = window.localStorage.getItem("letw-device-key");

  if (existing) {
    return existing;
  }

  const created =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem("letw-device-key", created);
  return created;
}

export function PlatformClient() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }

    async function heartbeat() {
      await fetch("/api/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceKey: deviceKey(),
          name: navigator.platform || "Browser device",
          userAgent: navigator.userAgent
        })
      }).catch(() => undefined);
    }

    heartbeat();
    const interval = window.setInterval(heartbeat, 60_000);
    return () => window.clearInterval(interval);
  }, []);

  return null;
}
