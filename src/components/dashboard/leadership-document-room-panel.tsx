"use client";

import Link from "next/link";
import { FormEvent, useRef, useState } from "react";
import { Download, Eye, FileLock2, Loader2, ShieldCheck, Trash2, Upload } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatBytes, formatDate } from "@/lib/utils";

type LeadershipDocument = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  status: "ACTIVE" | "ARCHIVED" | "REVOKED";
  fileName: string;
  fileType: string;
  size: number;
  createdAt: string;
  uploadedBy: {
    name: string | null;
    email: string | null;
  };
};

type LeadershipDocumentRoomPanelProps = {
  initialDocuments: LeadershipDocument[];
  canManage: boolean;
};

export function LeadershipDocumentRoomPanel({ initialDocuments, canManage }: LeadershipDocumentRoomPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [documents, setDocuments] = useState(initialDocuments);
  const [busy, setBusy] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    const response = await fetch("/api/leadership-documents", { cache: "no-store" });
    const payload = (await response.json().catch(() => null)) as { documents?: LeadershipDocument[]; error?: string } | null;
    if (response.ok && payload?.documents) {
      setDocuments(payload.documents.map((document) => ({ ...document, createdAt: new Date(document.createdAt).toISOString() })));
    }
  }

  async function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/leadership-documents", {
      method: "POST",
      body: formData
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    setBusy(false);
    if (!response.ok) {
      setError(payload?.error ?? "Leadership document upload failed.");
      return;
    }
    event.currentTarget.reset();
    if (fileInputRef.current) fileInputRef.current.value = "";
    setMessage("Leadership document uploaded.");
    await refresh();
  }

  async function deleteDocument(id: string) {
    setDeletingId(id);
    setError("");
    const response = await fetch(`/api/leadership-documents/${id}`, {
      method: "DELETE"
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    setDeletingId("");
    if (!response.ok) {
      setError(payload?.error ?? "Leadership document could not be deleted.");
      return;
    }
    setDocuments((current) => current.filter((document) => document.id !== id));
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <p className="flex items-center gap-2 text-sm font-medium text-moss">
          <FileLock2 className="h-4 w-4" />
          Private leadership document room
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-ink">Top-level protected files</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
          Store executive, board, pastoral, legal, and confidential leadership files outside ordinary workspaces. No share links are created here, and every download is audited.
        </p>
      </section>

      {canManage ? (
        <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Upload className="h-4 w-4 text-moss" />
            Upload protected document
          </p>
          <form className="mt-4 grid gap-4 lg:grid-cols-2" onSubmit={upload}>
            <label className="space-y-2 text-sm font-medium text-ink">
              Title
              <Input name="title" required placeholder="Example: Board resolution, pastoral directive, legal record" />
            </label>
            <label className="space-y-2 text-sm font-medium text-ink">
              Category
              <select className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm" name="category" defaultValue="EXECUTIVE">
                <option value="EXECUTIVE">Executive</option>
                <option value="BOARD">Board</option>
                <option value="PASTORAL">Pastoral</option>
                <option value="LEGAL">Legal</option>
                <option value="FINANCE">Finance</option>
                <option value="SAFEGUARDING">Safeguarding</option>
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-ink lg:col-span-2">
              Description
              <Textarea name="description" placeholder="Optional handling note, purpose, or access warning" />
            </label>
            <input
              ref={fileInputRef}
              className="block w-full rounded-md border border-ink/10 bg-white text-sm file:mr-3 file:h-10 file:border-0 file:bg-mint file:px-4 file:text-sm file:font-medium file:text-ink lg:col-span-2"
              name="file"
              type="file"
              required
            />
            {error ? <p className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay lg:col-span-2">{error}</p> : null}
            {message ? <p className="rounded-md bg-mint px-3 py-2 text-sm text-ink lg:col-span-2">{message}</p> : null}
            <Button disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload to private room
            </Button>
          </form>
        </section>
      ) : null}

      <section className="rounded-lg border border-ink/10 bg-white shadow-soft">
        <div className="flex items-center justify-between gap-3 border-b border-ink/10 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Protected leadership files</h2>
          <Badge>{documents.length} documents</Badge>
        </div>
        <div className="divide-y divide-ink/10">
          {documents.length === 0 ? <p className="p-8 text-sm text-ink/55">No protected leadership documents uploaded yet.</p> : null}
          {documents.map((document) => (
            <article key={document.id} className="p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-moss" />
                    <Badge className="bg-paper">{document.category.toLowerCase()}</Badge>
                    <Badge className={document.status === "ACTIVE" ? "bg-mint" : "bg-wheat"}>{document.status.toLowerCase()}</Badge>
                    <span className="text-xs text-ink/50">{formatBytes(document.size)}</span>
                  </div>
                  <h3 className="mt-2 break-words text-base font-semibold text-ink">{document.title}</h3>
                  <p className="mt-1 break-words text-sm text-ink/60">{document.fileName}</p>
                  {document.description ? <p className="mt-2 rounded-md bg-paper px-3 py-2 text-sm text-ink/65">{document.description}</p> : null}
                  <p className="mt-2 text-xs text-ink/50">
                    Uploaded by {document.uploadedBy.name ?? document.uploadedBy.email ?? "LETW"} - {formatDate(document.createdAt)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link className="inline-flex h-9 items-center gap-2 rounded-md border border-ink/10 bg-paper px-3 text-sm font-medium text-ink hover:bg-mint/40" href={`/api/leadership-documents/${document.id}/preview`} target="_blank">
                    <Eye className="h-4 w-4" />
                    Preview
                  </Link>
                  <Link className="inline-flex h-9 items-center gap-2 rounded-md border border-ink/10 bg-paper px-3 text-sm font-medium text-ink hover:bg-mint/40" href={`/api/leadership-documents/${document.id}/download`}>
                    <Download className="h-4 w-4" />
                    Download
                  </Link>
                  {canManage ? (
                    <Button variant="danger" disabled={deletingId === document.id} onClick={() => void deleteDocument(document.id)}>
                      {deletingId === document.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      Delete
                    </Button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
