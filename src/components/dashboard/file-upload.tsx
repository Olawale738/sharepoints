"use client";

import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { FormEvent, useRef, useState } from "react";

import { Button } from "@/components/ui/button";

type FileUploadProps = {
  workspaceId: string;
  folderId?: string | null;
  disabled?: boolean;
};

export function FileUpload({ workspaceId, folderId, disabled }: FileUploadProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const formData = new FormData(event.currentTarget);

    if (!formData.get("file")) {
      setError("Choose a file first.");
      return;
    }

    formData.set("workspaceId", workspaceId);

    if (folderId) {
      formData.set("folderId", folderId);
    }

    setIsUploading(true);
    const response = await fetch("/api/files/upload", {
      method: "POST",
      body: formData
    });
    setIsUploading(false);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Upload failed.");
      return;
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    router.refresh();
  }

  return (
    <form className="flex flex-col gap-2 sm:flex-row sm:items-center" onSubmit={handleSubmit}>
      <input
        ref={fileInputRef}
        className="block w-full rounded-md border border-ink/10 bg-white text-sm file:mr-3 file:h-10 file:border-0 file:bg-mint file:px-4 file:text-sm file:font-medium file:text-ink"
        name="file"
        type="file"
        disabled={disabled || isUploading}
      />
      <Button type="submit" disabled={disabled || isUploading}>
        {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Upload
      </Button>
      {error ? <p className="text-sm text-clay">{error}</p> : null}
    </form>
  );
}

