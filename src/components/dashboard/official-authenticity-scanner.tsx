"use client";

import { FormEvent, useRef, useState } from "react";
import { Camera, CheckCircle2, Loader2, QrCode, Search, ShieldAlert, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type OfficialSealResult = {
  found: boolean;
  kind: string;
  title: string;
  sealNumber?: string | null;
  status?: string | null;
  active: boolean;
  ownerName?: string | null;
  scope?: string | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  revokedAt?: string | null;
  verificationUrl?: string | null;
  message: string;
  warning?: string | null;
};

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue?: string }>>;
};

function dateLabel(value?: string | null) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value));
}

function typeLabel(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function OfficialAuthenticityScanner({ initialCode = "" }: { initialCode?: string }) {
  const [query, setQuery] = useState(initialCode);
  const [result, setResult] = useState<OfficialSealResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  async function lookup(nextQuery = query) {
    const trimmed = nextQuery.trim();
    if (!trimmed) return;
    setLoading(true);
    setResult(null);
    try {
      const response = await fetch(`/api/official-registry/verify?q=${encodeURIComponent(trimmed)}`, { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as { result?: OfficialSealResult; error?: string } | null;
      if (!response.ok || !payload?.result) {
        setResult({
          found: false,
          kind: "UNKNOWN",
          title: "Verification failed",
          active: false,
          message: payload?.error ?? "The LETW registry could not read this code."
        });
        return;
      }
      setResult(payload.result);
    } finally {
      setLoading(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void lookup();
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  async function startCamera() {
    setCameraError("");
    const detectorClass = (window as Window & { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
    if (!detectorClass) {
      setCameraError("This browser does not support camera QR detection yet. Type or paste the code instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setCameraOn(true);
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const detector = new detectorClass({ formats: ["qr_code"] });
      const scan = async () => {
        if (!videoRef.current || !streamRef.current) return;
        const codes = await detector.detect(videoRef.current).catch(() => []);
        const value = codes[0]?.rawValue;
        if (value) {
          setQuery(value);
          stopCamera();
          await lookup(value);
          return;
        }
        window.setTimeout(() => void scan(), 650);
      };
      void scan();
    } catch {
      setCameraError("Camera access was blocked or unavailable. Type or paste the LETW code instead.");
      stopCamera();
    }
  }

  const valid = result?.found && result.active;
  const invalid = result && (!result.found || !result.active);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <form className="space-y-4" onSubmit={submit}>
          <label className="space-y-2 text-sm font-medium text-ink">
            LETW seal number, QR URL, certificate number, letter number, ID number, student ID, report code, handover code, circular number, or pastor transfer code
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Example: LETW.ORG-5FEE6D4184 or LETW-CERT-2026-..."
                required
              />
              <Button disabled={loading} type="submit">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Verify
              </Button>
            </div>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => void startCamera()}>
              <Camera className="h-4 w-4" />
              Scan QR with camera
            </Button>
            {cameraOn ? (
              <Button type="button" variant="danger" onClick={stopCamera}>
                Stop camera
              </Button>
            ) : null}
          </div>
          {cameraError ? <p className="rounded-md bg-wheat px-3 py-2 text-sm text-ink">{cameraError}</p> : null}
          {cameraOn ? (
            <div className="overflow-hidden rounded-lg border border-ink/10 bg-ink">
              <video className="aspect-video w-full object-cover" muted playsInline ref={videoRef} />
            </div>
          ) : null}
        </form>

        {result ? (
          <div className={`mt-6 rounded-lg border p-5 ${valid ? "border-moss/25 bg-mint/50" : "border-clay/25 bg-clay/10"}`}>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                {valid ? <CheckCircle2 className="mt-1 h-7 w-7 text-moss" /> : <XCircle className="mt-1 h-7 w-7 text-clay" />}
                <div>
                  <p className="text-sm font-semibold text-ink">{valid ? "Authentic and active" : invalid ? "Not accepted" : "Check result"}</p>
                  <h2 className="mt-1 text-2xl font-semibold text-ink">{result.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-ink/65">{result.message}</p>
                </div>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${valid ? "bg-moss text-white" : "bg-clay text-white"}`}>
                {result.status ?? (result.found ? "registered" : "not found")}
              </span>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-2">
              <Info label="Record type" value={typeLabel(result.kind)} />
              <Info label="Seal / code" value={result.sealNumber ?? "Not recorded"} />
              <Info label="Owner / holder" value={result.ownerName ?? (result.active ? "Not recorded" : "Hidden unless active")} />
              <Info label="Scope" value={result.scope ?? "LETW official registry"} />
              <Info label="Issued / created" value={dateLabel(result.issuedAt)} />
              <Info label="Expires" value={dateLabel(result.expiresAt)} />
            </div>

            {result.warning ? (
              <p className="mt-4 flex items-start gap-2 rounded-md bg-white/75 px-3 py-2 text-sm text-clay">
                <ShieldAlert className="mt-0.5 h-4 w-4" />
                {result.warning}
              </p>
            ) : null}

            {result.verificationUrl ? (
              <a
                className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[#0b1b3d] px-4 text-sm font-medium text-white"
                href={result.verificationUrl}
              >
                <QrCode className="h-4 w-4" />
                Open official verification page
              </a>
            ) : null}
          </div>
        ) : null}
      </section>

      <aside className="space-y-4">
        <div className="rounded-lg border border-ink/10 bg-white p-4 shadow-soft">
          <p className="text-sm font-semibold text-ink">What this scanner checks</p>
          <div className="mt-3 space-y-2 text-xs leading-5 text-ink/60">
            <p>Official letters, certificates, reports, handovers, pastor transfers, circulars, giving receipts, digital IDs, student IDs, and digital signatures.</p>
            <p>Active records are marked as accepted. Revoked, expired, draft, archived, cancelled, lost, void, deleted, or unknown codes are rejected.</p>
            <p>The scanner does not expose confidential letter bodies, report details, pastoral notes, or protected internal metadata.</p>
          </div>
        </div>
        <div className="rounded-lg border border-[#d4af37]/35 bg-[#fffaf0] p-4">
          <p className="text-sm font-semibold text-[#0b1b3d]">Official LETW rule</p>
          <p className="mt-2 text-xs leading-5 text-ink/65">
            A printed document is valid only when its QR or seal number confirms an active status in the LETW registry.
          </p>
        </div>
      </aside>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-ink/10 bg-white px-3 py-2">
      <p className="text-xs uppercase tracking-wide text-ink/45">{label}</p>
      <p className="mt-1 break-words text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}
