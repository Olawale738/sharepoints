"use client";

import { KeyRound, Laptop, Loader2, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Device = {
  id: string;
  name?: string | null;
  userAgent?: string | null;
  lastSeenAt: string;
  revokedAt?: string | null;
};

export function SecurityProfilePanel() {
  const [twoFactor, setTwoFactor] = useState<{ enabled: boolean; secret?: string; uri?: string } | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const [twoFactorResponse, devicesResponse] = await Promise.all([
      fetch("/api/security/two-factor"),
      fetch("/api/security/devices")
    ]);

    if (twoFactorResponse.ok) setTwoFactor(await twoFactorResponse.json());
    if (devicesResponse.ok) {
      const data = (await devicesResponse.json()) as { devices: Device[] };
      setDevices(data.devices);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function updateTwoFactor(method: "POST" | "DELETE") {
    setBusy(true);
    setError("");
    const response = await fetch("/api/security/two-factor", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code })
    });
    setBusy(false);
    const data = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setError(data?.error ?? "Two-factor settings could not be changed.");
      return;
    }

    setCode("");
    await load();
  }

  async function revokeDevice(id: string) {
    if (!window.confirm("Revoke this device and all current account sessions?")) return;
    await fetch("/api/security/devices", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id })
    });
    await load();
  }

  return (
    <section className="max-w-3xl space-y-5">
      <div className="rounded-lg border border-ink/10 bg-white p-5">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-moss" />
          <h2 className="font-semibold">Two-factor authentication</h2>
        </div>
        {twoFactor?.enabled ? (
          <div className="mt-4">
            <Badge className="bg-mint">enabled</Badge>
            <p className="mt-2 text-sm text-ink/55">Your password and a six-digit authenticator code are required at sign in.</p>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-ink/60">Add this secret to Google Authenticator, Microsoft Authenticator, or another TOTP app.</p>
            <code className="block overflow-x-auto rounded-md bg-paper px-3 py-3 text-sm">{twoFactor?.secret ?? "Loading..."}</code>
            {twoFactor?.uri ? <p className="break-all text-xs text-ink/40">{twoFactor.uri}</p> : null}
          </div>
        )}
        <div className="mt-4 flex max-w-md gap-2">
          <Input
            inputMode="numeric"
            maxLength={6}
            placeholder="Six-digit authenticator code"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
          />
          <Button disabled={busy || code.length !== 6} onClick={() => updateTwoFactor(twoFactor?.enabled ? "DELETE" : "POST")}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {twoFactor?.enabled ? "Disable" : "Enable"}
          </Button>
        </div>
        {error ? <p className="mt-2 text-sm text-clay">{error}</p> : null}
      </div>

      <div className="overflow-hidden rounded-lg border border-ink/10 bg-white">
        <div className="flex items-center gap-2 border-b border-ink/10 px-4 py-3">
          <Laptop className="h-4 w-4 text-moss" />
          <h2 className="font-semibold">Your devices</h2>
        </div>
        <div className="divide-y divide-ink/10">
          {devices.map((device) => (
            <div key={device.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="flex min-w-0 items-start gap-3">
                <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-moss" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{device.name ?? "Browser device"}</p>
                  <p className="truncate text-xs text-ink/45">{device.userAgent ?? "Unknown browser"}</p>
                  <p className="text-xs text-ink/40">Last active {new Date(device.lastSeenAt).toLocaleString()}</p>
                </div>
              </div>
              {device.revokedAt ? (
                <Badge className="bg-clay/10 text-clay">revoked</Badge>
              ) : (
                <Button className="h-9 w-9 px-0" variant="danger" onClick={() => revokeDevice(device.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
