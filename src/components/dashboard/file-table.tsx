"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Download, Eye, FileClock, FileText, Folder, Link2, Lock, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocumentHistoryDialog } from "@/components/dashboard/document-history-dialog";
import { formatBytes, formatDate } from "@/lib/utils";

type FolderRow = {
  id: string;
  name: string;
  createdAt: string;
};

type FileRow = {
  id: string;
  fileName: string;
  fileType: string;
  size: number;
  createdAt: string;
  approvalStatus?: "PENDING" | "APPROVED" | "REJECTED";
  rejectedReason?: string | null;
  currentVersionNumber?: number;
  checkedOutById?: string | null;
  legalHold?: boolean;
  retentionUntil?: string | null;
  scanStatus?: "PENDING" | "CLEAN" | "INFECTED" | "SKIPPED";
  uploadedBy: {
    name?: string | null;
    email?: string | null;
  };
};

const approvalClassName: Record<NonNullable<FileRow["approvalStatus"]>, string> = {
  PENDING: "bg-wheat",
  APPROVED: "bg-mint",
  REJECTED: "bg-clay/10 text-clay"
};

type FileTableProps = {
  workspaceId: string;
  folders: FolderRow[];
  files: FileRow[];
  canDeleteFiles: boolean;
  canCreateShareLinks: boolean;
  canUploadFiles: boolean;
  canManageGovernance: boolean;
};

export function FileTable({
  workspaceId,
  folders,
  files,
  canDeleteFiles,
  canCreateShareLinks,
  canUploadFiles,
  canManageGovernance
}: FileTableProps) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState("");
  const [sharingId, setSharingId] = useState("");
  const [shareStatus, setShareStatus] = useState("");
  const [error, setError] = useState("");
  const [historyFile, setHistoryFile] = useState<FileRow | null>(null);
  const hasRows = folders.length > 0 || files.length > 0;

  async function copyText(value: string) {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
    }
  }

  async function deleteFile(fileId: string) {
    setDeletingId(fileId);
    const response = await fetch(`/api/files/${fileId}`, {
      method: "DELETE"
    });
    setDeletingId("");

    if (response.ok) {
      router.refresh();
    }
  }

  async function createShareLink(fileId: string) {
    setError("");
    setShareStatus("");
    setSharingId(fileId);
    const response = await fetch(`/api/files/${fileId}/share-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expiresInDays: 30 })
    });
    setSharingId("");

    const data = (await response.json().catch(() => null)) as {
      shareLink?: { url: string };
      error?: string;
    } | null;

    if (!response.ok || !data?.shareLink) {
      setError(data?.error ?? "Share link could not be created.");
      return;
    }

    await copyText(data.shareLink.url);
    setShareStatus("Member-only download link copied. It expires in 30 days.");
  }

  return (
    <div className="overflow-hidden rounded-lg border border-ink/10 bg-white">
      {error ? <p className="border-b border-ink/10 bg-clay/10 px-4 py-2 text-sm text-clay">{error}</p> : null}
      {shareStatus ? <p className="border-b border-ink/10 bg-mint px-4 py-2 text-sm text-ink">{shareStatus}</p> : null}
      <div className="grid grid-cols-[minmax(0,1fr)_9rem_10rem_12rem] border-b border-ink/10 bg-ink/[0.03] px-4 py-3 text-xs font-semibold uppercase text-ink/60 max-md:hidden">
        <span>Name</span>
        <span>Size</span>
        <span>Modified</span>
        <span className="text-right">Actions</span>
      </div>

      {!hasRows ? (
        <div className="px-4 py-12 text-center text-sm text-ink/55">No files or folders yet.</div>
      ) : null}

      {folders.map((folder) => (
        <Link
          key={folder.id}
          href={`/dashboard/workspaces/${workspaceId}?folder=${folder.id}`}
          className="grid grid-cols-[minmax(0,1fr)_9rem_10rem_12rem] items-center border-b border-ink/10 px-4 py-3 text-sm transition hover:bg-mint/35 max-md:grid-cols-1 max-md:gap-2"
        >
          <span className="flex min-w-0 items-center gap-3 font-medium">
            <Folder className="h-5 w-5 shrink-0 text-moss" />
            <span className="truncate">{folder.name}</span>
          </span>
          <span className="text-ink/50 max-md:hidden">Folder</span>
          <span className="text-ink/60">{formatDate(folder.createdAt)}</span>
          <span />
        </Link>
      ))}

      {files.map((file) => (
        <div
          key={file.id}
          className="grid grid-cols-[minmax(0,1fr)_9rem_10rem_12rem] items-center border-b border-ink/10 px-4 py-3 text-sm last:border-b-0 max-md:grid-cols-1 max-md:gap-2"
        >
          <div className="flex min-w-0 items-center gap-3">
            <FileText className="h-5 w-5 shrink-0 text-clay" />
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <p className="truncate font-medium">{file.fileName}</p>
                <Badge>v{file.currentVersionNumber ?? 1}</Badge>
                {file.approvalStatus ? (
                  <Badge className={approvalClassName[file.approvalStatus]}>{file.approvalStatus.toLowerCase()}</Badge>
                ) : null}
                {file.scanStatus === "CLEAN" ? <ShieldCheck className="h-4 w-4 text-moss" aria-label="Security screened" /> : null}
                {file.checkedOutById ? <Lock className="h-4 w-4 text-clay" aria-label="Checked out" /> : null}
                {file.legalHold ? <Badge className="bg-wheat">legal hold</Badge> : null}
              </div>
              <p className="truncate text-xs text-ink/50">{file.uploadedBy.name ?? file.uploadedBy.email}</p>
              {file.rejectedReason ? <p className="mt-1 text-xs text-clay">{file.rejectedReason}</p> : null}
            </div>
          </div>
          <span className="text-ink/60">{formatBytes(file.size)}</span>
          <span className="text-ink/60">{formatDate(file.createdAt)}</span>
          <div className="flex justify-end gap-2 max-md:justify-start">
            <Button
              aria-label={`Version history for ${file.fileName}`}
              className="h-9 w-9 px-0"
              variant="secondary"
              onClick={() => setHistoryFile(file)}
            >
              <FileClock className="h-4 w-4" />
            </Button>
            <Button
              aria-label={`Preview ${file.fileName}`}
              className="h-9 w-9 px-0"
              variant="secondary"
              onClick={() => window.open(`/api/files/${file.id}/preview`, "_blank", "noopener,noreferrer")}
            >
              <Eye className="h-4 w-4" />
            </Button>
            <Button
              aria-label={`Download ${file.fileName}`}
              className="h-9 w-9 px-0"
              variant="secondary"
              onClick={() => window.open(`/api/files/${file.id}/download`, "_blank", "noopener,noreferrer")}
            >
              <Download className="h-4 w-4" />
            </Button>
            {canCreateShareLinks ? (
              <Button
                aria-label={`Create share link for ${file.fileName}`}
                className="h-9 w-9 px-0"
                variant="secondary"
                disabled={sharingId === file.id}
                onClick={() => createShareLink(file.id)}
              >
                <Link2 className="h-4 w-4" />
              </Button>
            ) : null}
            {canDeleteFiles ? (
              <Button
                aria-label={`Delete ${file.fileName}`}
                className="h-9 w-9 px-0"
                variant="danger"
                disabled={deletingId === file.id}
                onClick={() => deleteFile(file.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
      ))}
      {historyFile ? (
        <DocumentHistoryDialog
          fileId={historyFile.id}
          fileName={historyFile.fileName}
          canUpload={canUploadFiles}
          canManageGovernance={canManageGovernance}
          onClose={() => setHistoryFile(null)}
        />
      ) : null}
    </div>
  );
}
