"use client";

import { useRouter } from "next/navigation";
import { FolderPlus, Loader2 } from "lucide-react";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type FolderCreateFormProps = {
  workspaceId: string;
  parentId?: string | null;
  disabled?: boolean;
};

export function FolderCreateForm({ workspaceId, parentId, disabled }: FolderCreateFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const response = await fetch(`/api/workspaces/${workspaceId}/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(formData.get("name")),
        parentId: parentId ?? null
      })
    });

    setIsSubmitting(false);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Folder could not be created.");
      return;
    }

    event.currentTarget.reset();
    router.refresh();
  }

  return (
    <form className="flex flex-col gap-2 sm:flex-row" onSubmit={handleSubmit}>
      <Input name="name" placeholder="Folder name" disabled={disabled || isSubmitting} required />
      <Button variant="secondary" type="submit" disabled={disabled || isSubmitting}>
        {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />}
        Folder
      </Button>
      {error ? <p className="text-sm text-clay">{error}</p> : null}
    </form>
  );
}

