"use client";

import { Bell, CheckCircle2, Download, Loader2, RefreshCcw, Smartphone, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type PwaStatus = {
  serviceWorker: boolean;
  standalone: boolean;
  online: boolean;
  notifications: NotificationPermission | "unsupported";
};

function currentStatus(): PwaStatus {
  return {
    serviceWorker: "serviceWorker" in navigator,
    standalone:
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone),
    online: navigator.onLine,
    notifications: "Notification" in window ? Notification.permission : "unsupported"
  };
}

export function PwaCenterPanel({ pushSubscriptionsCount }: { pushSubscriptionsCount: number }) {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [status, setStatus] = useState<PwaStatus | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function handleBeforeInstall(event: Event) {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    }

    function refreshStatus() {
      setStatus(currentStatus());
    }

    refreshStatus();
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);
    window.addEventListener("online", refreshStatus);
    window.addEventListener("offline", refreshStatus);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      window.removeEventListener("online", refreshStatus);
      window.removeEventListener("offline", refreshStatus);
    };
  }, []);

  async function install() {
    if (!promptEvent) return;
    setBusy(true);
    await promptEvent.prompt();
    await promptEvent.userChoice;
    setPromptEvent(null);
    setStatus(currentStatus());
    setBusy(false);
  }

  async function enableNotifications() {
    if (!("Notification" in window)) return;
    setBusy(true);
    await Notification.requestPermission();
    setStatus(currentStatus());
    setBusy(false);
  }

  const checks = [
    {
      label: "Installable app shell",
      detail: "LETW has a manifest, icons, start URL, and standalone display mode.",
      ready: Boolean(status?.serviceWorker),
      icon: Smartphone
    },
    {
      label: "Offline fallback",
      detail: "The app keeps the login, offline screen, logo, and shell available when connection drops.",
      ready: Boolean(status?.serviceWorker),
      icon: WifiOff
    },
    {
      label: "Push notification channel",
      detail: `${pushSubscriptionsCount} saved notification subscription${pushSubscriptionsCount === 1 ? "" : "s"}.`,
      ready: pushSubscriptionsCount > 0 || status?.notifications === "granted",
      icon: Bell
    },
    {
      label: "Installed on this device",
      detail: status?.standalone ? "This browser is running LETW as an installed app." : "Use the install button or browser menu.",
      ready: Boolean(status?.standalone),
      icon: Download
    }
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <Smartphone className="h-4 w-4" />
              Mobile App / PWA
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Install LETW on phones and tablets</h1>
            <p className="mt-2 max-w-3xl text-sm text-ink/60">
              Members can install LETW from the browser, keep the secure shell offline, receive notifications, open ID cards, chat,
              meetings, forms, attendance scanners, and workspace tools from the home screen.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!promptEvent || busy} onClick={install}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Install app
            </Button>
            <Button disabled={busy || status?.notifications === "unsupported"} variant="secondary" onClick={enableNotifications}>
              <Bell className="h-4 w-4" />
              Enable notifications
            </Button>
            <Button variant="secondary" onClick={() => setStatus(currentStatus())}>
              <RefreshCcw className="h-4 w-4" />
              Refresh status
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {checks.map((check) => {
          const Icon = check.icon;

          return (
            <div className="rounded-lg border border-ink/10 bg-white p-4" key={check.label}>
              <Icon className="h-5 w-5 text-moss" />
              <div className="mt-3 flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-ink">{check.label}</p>
                <Badge className={check.ready ? "bg-mint" : "bg-wheat"}>{check.ready ? "ready" : "needs setup"}</Badge>
              </div>
              <p className="mt-2 text-xs leading-5 text-ink/55">{check.detail}</p>
            </div>
          );
        })}
      </section>

      <section className="rounded-lg border border-ink/10 bg-white p-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-ink">
          <CheckCircle2 className="h-4 w-4 text-moss" />
          Recommended member workflow
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {["Open sharepoints.letw.org on phone", "Tap Install or Add to Home Screen", "Enable notifications", "Use ID, chat, meetings, and scanner from the app"].map(
            (step, index) => (
              <div className="rounded-md bg-paper p-3 text-sm text-ink/70" key={step}>
                <span className="text-xs font-semibold uppercase tracking-wide text-moss">Step {index + 1}</span>
                <p className="mt-2">{step}</p>
              </div>
            )
          )}
        </div>
      </section>
    </div>
  );
}
