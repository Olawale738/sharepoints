"use client";

import { KeyRound, Loader2, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type SigningKey = {
  id: string;
  kid: string;
  algorithm: string;
  active: boolean;
  createdAt: string;
  retiredAt: string | null;
};

export function CredentialSigningKeyPanel() {
  const [keys, setKeys] = useState<SigningKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    const response = await fetch("/api/admin/credential-keys");
    const result = (await response.json().catch(() => null)) as
      | { keys?: SigningKey[]; error?: string }
      | null;
    setLoading(false);
    if (!response.ok) {
      setMessage(result?.error ?? "Signing keys could not be loaded.");
      return;
    }
    setKeys(result?.keys ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function rotate() {
    const warning =
      "Rotate the LETW credential signing key? Existing signed credentials will remain verifiable, while newly issued credentials will use the new key.";
    if (!window.confirm(warning)) return;
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/credential-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation: "ROTATE LETW SIGNING KEY" })
    });
    const result = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!response.ok) {
      setMessage(result?.error ?? "Signing key could not be rotated.");
      return;
    }
    setMessage("New Ed25519 signing key activated.");
    await load();
  }

  const activeKey = keys.find((key) => key.active);

  return (
    <section className="rounded-lg border border-ink/10 bg-white">
      <div className="flex items-center gap-2 border-b border-ink/10 px-4 py-3">
        <KeyRound className="h-4 w-4 text-moss" />
        <h2 className="text-sm font-semibold">Credential signing authority</h2>
      </div>
      <div className="space-y-3 p-4">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-moss" />
        ) : activeKey ? (
          <div className="rounded-md bg-paper p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold">Active Ed25519 public key</p>
              <Badge className="bg-mint text-moss">active</Badge>
            </div>
            <p className="mt-2 break-all font-mono text-[11px] text-ink/60">{activeKey.kid}</p>
            <p className="mt-1 text-xs text-ink/45">
              Created {new Date(activeKey.createdAt).toLocaleString()} - {keys.length} trusted key
              {keys.length === 1 ? "" : "s"} published
            </p>
          </div>
        ) : (
          <p className="rounded-md bg-paper p-3 text-sm text-ink/55">
            The first credential scan or issuance will initialize the signing authority.
          </p>
        )}
        {message ? <p className="text-xs text-ink/55">{message}</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => void rotate()}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {activeKey ? "Rotate signing key" : "Initialize signing key"}
          </Button>
          <a
            className="inline-flex h-10 items-center gap-2 rounded-md border border-ink/10 bg-white px-3 text-sm font-medium hover:bg-mint/40"
            href="/api/credentials/jwks"
            target="_blank"
            rel="noreferrer"
          >
            <KeyRound className="h-4 w-4" />
            View public keys
          </a>
        </div>
      </div>
    </section>
  );
}
