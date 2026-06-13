"use client";

import { AlertTriangle, CheckCircle2, CircleHelp, Loader2, RadioTower } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

type Incident = {
  id: string;
  title: string;
  instructions: string;
  severity: string;
  status: string;
  location: string | null;
  activatedAt: string | null;
};

type WelfareResponse = {
  incidentId: string;
  status: string;
  note: string | null;
};

export function EmergencyCenter() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [responses, setResponses] = useState<WelfareResponse[]>([]);
  const [note, setNote] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/emergencies");
    const body = (await response.json().catch(() => null)) as {
      incidents?: Incident[];
      responses?: WelfareResponse[];
      error?: string;
    } | null;
    setLoading(false);
    if (!response.ok) {
      setError(body?.error ?? "Emergency information could not be loaded.");
      return;
    }
    setIncidents(body?.incidents ?? []);
    setResponses(body?.responses ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function respond(incidentId: string, status: "SAFE" | "NEEDS_HELP" | "NO_RESPONSE") {
    setBusyId(incidentId);
    setError("");
    const response = await fetch(`/api/emergencies/${incidentId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, note: note[incidentId] || null })
    });
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusyId("");
    if (!response.ok) {
      setError(body?.error ?? "Your welfare response could not be recorded.");
      return;
    }
    await load();
  }

  if (loading) {
    return <div className="flex justify-center rounded-lg border border-ink/10 bg-white p-16"><Loader2 className="h-6 w-6 animate-spin text-moss" /></div>;
  }

  return (
    <div className="space-y-4">
      {error ? <p className="rounded-md bg-clay/10 px-4 py-3 text-sm text-clay">{error}</p> : null}
      {incidents.length === 0 ? (
        <section className="rounded-lg border border-ink/10 bg-white p-8 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-moss" />
          <h2 className="mt-3 font-semibold">No active emergency broadcasts</h2>
          <p className="mt-1 text-sm text-ink/55">LETW will place urgent instructions here when a welfare response is needed.</p>
        </section>
      ) : null}
      {incidents.map((incident) => {
        const current = responses.find((response) => response.incidentId === incident.id);
        return (
          <section className="rounded-lg border border-clay/25 bg-white p-5" key={incident.id}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold text-clay"><RadioTower className="h-4 w-4" />Active LETW emergency</p>
                <h2 className="mt-2 text-2xl font-semibold">{incident.title}</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-ink/70">{incident.instructions}</p>
                <p className="mt-2 text-xs text-ink/45">{incident.location ?? "All affected locations"}{incident.activatedAt ? ` - activated ${new Date(incident.activatedAt).toLocaleString()}` : ""}</p>
              </div>
              <Badge className="bg-clay/10 text-clay">{incident.severity.toLowerCase()}</Badge>
            </div>
            {current ? <p className="mt-4 rounded-md bg-mint px-3 py-2 text-sm text-moss">Your current response: {current.status.toLowerCase().replaceAll("_", " ")}</p> : null}
            <Textarea className="mt-4" placeholder="Optional note for the emergency response team" value={note[incident.id] ?? ""} onChange={(event) => setNote((currentNotes) => ({ ...currentNotes, [incident.id]: event.target.value }))} />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button disabled={busyId === incident.id} onClick={() => void respond(incident.id, "SAFE")}><CheckCircle2 className="h-4 w-4" />I am safe</Button>
              <Button disabled={busyId === incident.id} variant="danger" onClick={() => void respond(incident.id, "NEEDS_HELP")}><AlertTriangle className="h-4 w-4" />I need help</Button>
              <Button disabled={busyId === incident.id} variant="secondary" onClick={() => void respond(incident.id, "NO_RESPONSE")}><CircleHelp className="h-4 w-4" />Unable to confirm</Button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
