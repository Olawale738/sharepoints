"use client";

import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type WorkspaceDangerZoneProps = {
  workspaceId: string;
  workspaceName: string;
};

export function WorkspaceDangerZone({ workspaceId, workspaceName }: WorkspaceDangerZoneProps) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [isDeleting, setIsDeleting] = useState(false);
  const canDelete = confirmation.trim() === workspaceName;

  async function deleteWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canDelete) {
      setError("Type the workspace name exactly before deleting.");
      return;
    }

    setError("");
    setIsDeleting(true);

    const response = await fetch(`/api/workspaces/${workspaceId}`, {
      method: "DELETE"
    });
    const data = (await response.json().catch(() => null)) as { error?: string } | null;

    setIsDeleting(false);

    if (!response.ok) {
      setError(data?.error ?? "Workspace could not be deleted.");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="rounded-lg border border-clay/20 bg-white p-4">
      <div className="mb-3 flex items-center gap-2">
        <Trash2 className="h-4 w-4 text-clay" />
        <h2 className="text-sm font-semibold text-ink">Delete workspace</h2>
      </div>
      <p className="text-sm text-ink/60">
        This removes the workspace, members, files, folders, chats, tasks, announcements, and integrations.
      </p>
      <form className="mt-4 space-y-3" onSubmit={deleteWorkspace}>
        <div className="space-y-2">
          <Label htmlFor="delete-workspace-confirm">Type workspace name</Label>
          <Input
            id="delete-workspace-confirm"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={workspaceName}
            disabled={isDeleting}
          />
        </div>
        {error ? <p className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
        <Button className="w-full" type="submit" variant="danger" disabled={!canDelete || isDeleting}>
          {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Delete workspace
        </Button>
      </form>
    </div>
  );
}
