"use client";

import {
  CheckCircle2,
  FileClock,
  Loader2,
  Lock,
  MessageSquareText,
  RotateCcw,
  ShieldAlert,
  Upload,
  X
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatBytes, formatDate } from "@/lib/utils";

type DocumentHistory = {
  currentVersionNumber: number;
  checkedOutById?: string | null;
  checkedOutAt?: string | null;
  legalHold?: boolean;
  retentionUntil?: string | null;
  checkedOutBy?: { name?: string | null; email?: string | null } | null;
  versions: Array<{
    id: string;
    versionNumber: number;
    fileName: string;
    size: number;
    changeNote?: string | null;
    createdAt: string;
    uploadedBy: { name?: string | null; email?: string | null };
  }>;
  comments: Array<{
    id: string;
    body: string;
    createdAt: string;
    author: { name?: string | null; email?: string | null };
  }>;
};

export function DocumentHistoryDialog({
  fileId,
  fileName,
  canUpload,
  canManageGovernance,
  onClose
}: {
  fileId: string;
  fileName: string;
  canUpload: boolean;
  canManageGovernance: boolean;
  onClose: () => void;
}) {
  const [history, setHistory] = useState<DocumentHistory | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadHistory = useCallback(async () => {
    const response = await fetch(`/api/files/${fileId}/versions`);
    const data = (await response.json().catch(() => null)) as { file?: DocumentHistory; error?: string } | null;

    if (!response.ok || !data?.file) {
      setError(data?.error ?? "Document history could not be loaded.");
      return;
    }

    setHistory(data.file);
  }, [fileId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  async function uploadVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch(`/api/files/${fileId}/versions`, { method: "POST", body: formData });
    setBusy(false);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Version could not be uploaded.");
      return;
    }

    form.reset();
    await loadHistory();
  }

  async function governance(
    action: "CHECK_OUT" | "CHECK_IN" | "SET_LEGAL_HOLD" | "SET_RETENTION",
    extra: Record<string, unknown> = {}
  ) {
    setBusy(true);
    const response = await fetch(`/api/files/${fileId}/governance`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra })
    });
    setBusy(false);
    const data = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      setError(data?.error ?? "Document state could not be changed.");
      return;
    }

    await loadHistory();
  }

  async function restoreVersion(versionId: string) {
    if (!window.confirm("Restore this document version as the current version?")) return;
    setBusy(true);
    const response = await fetch(`/api/files/${fileId}/versions/${versionId}`, { method: "POST" });
    setBusy(false);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Version could not be restored.");
      return;
    }

    await loadHistory();
  }

  async function addComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch(`/api/files/${fileId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: String(formData.get("body")) })
    });

    if (response.ok) {
      form.reset();
      await loadHistory();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-ink/10 bg-white shadow-soft">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-ink/10 bg-white px-4 py-3">
          <div>
            <p className="text-xs font-medium text-moss">Document control</p>
            <h2 className="font-semibold">{fileName}</h2>
          </div>
          <button
            aria-label="Close document history"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-paper"
            type="button"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {!history ? (
          <p className="flex items-center gap-2 p-6 text-sm text-ink/55">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading document history
          </p>
        ) : (
          <div className="space-y-6 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-paper p-3">
              <div>
                <p className="text-sm font-medium">Current version {history.currentVersionNumber}</p>
                <p className="text-xs text-ink/50">
                  {history.checkedOutBy
                    ? `Checked out by ${history.checkedOutBy.name ?? history.checkedOutBy.email}`
                    : "Available for editing"}
                </p>
              </div>
              {canUpload ? (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => governance(history.checkedOutById ? "CHECK_IN" : "CHECK_OUT")}
                >
                  {history.checkedOutById ? <CheckCircle2 className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                  {history.checkedOutById ? "Check in" : "Check out"}
                </Button>
              ) : null}
            </div>

            {canUpload ? (
              <form className="grid gap-3 rounded-md border border-ink/10 p-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={uploadVersion}>
                <Input name="file" type="file" required />
                <Input name="changeNote" placeholder="What changed?" />
                <Button type="submit" disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  Upload version
                </Button>
              </form>
            ) : null}

            {canManageGovernance ? (
              <div className="grid gap-3 rounded-md border border-ink/10 p-3 md:grid-cols-2">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-moss" />
                    <p className="text-sm font-semibold">Legal hold</p>
                  </div>
                  <p className="mb-3 text-xs text-ink/50">
                    A legal hold prevents this document and its versions from being deleted.
                  </p>
                  <Button
                    variant={history.legalHold ? "danger" : "secondary"}
                    disabled={busy}
                    onClick={() => governance("SET_LEGAL_HOLD", { legalHold: !history.legalHold })}
                  >
                    {history.legalHold ? "Remove legal hold" : "Apply legal hold"}
                  </Button>
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const formData = new FormData(event.currentTarget);
                    void governance("SET_RETENTION", {
                      retentionUntil: String(formData.get("retentionUntil") ?? "") || null
                    });
                  }}
                >
                  <p className="mb-2 text-sm font-semibold">Retention date</p>
                  <p className="mb-3 text-xs text-ink/50">
                    The document cannot be deleted before this date.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      defaultValue={history.retentionUntil?.slice(0, 10) ?? ""}
                      name="retentionUntil"
                      type="date"
                    />
                    <Button type="submit" variant="secondary" disabled={busy}>
                      Save
                    </Button>
                  </div>
                </form>
              </div>
            ) : null}

            {error ? <p className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}

            <div>
              <div className="mb-3 flex items-center gap-2">
                <FileClock className="h-4 w-4 text-moss" />
                <h3 className="text-sm font-semibold">Version history</h3>
              </div>
              <div className="divide-y divide-ink/10 rounded-md border border-ink/10">
                {history.versions.map((version) => (
                  <div key={version.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-sm">
                    <div>
                      <p className="font-medium">
                        Version {version.versionNumber}
                        {version.versionNumber === history.currentVersionNumber ? <Badge className="ml-2 bg-mint">current</Badge> : null}
                      </p>
                      <p className="text-xs text-ink/50">
                        {version.uploadedBy.name ?? version.uploadedBy.email} - {formatDate(version.createdAt)} - {formatBytes(version.size)}
                      </p>
                      {version.changeNote ? <p className="mt-1 text-xs text-ink/65">{version.changeNote}</p> : null}
                    </div>
                    {canUpload && version.versionNumber !== history.currentVersionNumber ? (
                      <Button className="h-9" variant="secondary" disabled={busy} onClick={() => restoreVersion(version.id)}>
                        <RotateCcw className="h-4 w-4" />
                        Restore
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="mb-3 flex items-center gap-2">
                <MessageSquareText className="h-4 w-4 text-moss" />
                <h3 className="text-sm font-semibold">Document comments</h3>
              </div>
              <form className="flex gap-2" onSubmit={addComment}>
                <Textarea className="min-h-10" name="body" placeholder="Add a document comment" required />
                <Button type="submit">Comment</Button>
              </form>
              <div className="mt-3 space-y-2">
                {history.comments.map((comment) => (
                  <div key={comment.id} className="rounded-md bg-paper px-3 py-2 text-sm">
                    <p>{comment.body}</p>
                    <p className="mt-1 text-xs text-ink/45">
                      {comment.author.name ?? comment.author.email} - {formatDate(comment.createdAt)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
