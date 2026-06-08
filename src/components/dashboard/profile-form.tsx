"use client";

import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type ProfileFormProps = {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
};

export function ProfileForm({ user }: ProfileFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved(false);
    setIsSaving(true);

    const formData = new FormData(event.currentTarget);
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(formData.get("name")),
        image: String(formData.get("image") ?? "")
      })
    });

    setIsSaving(false);

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Profile could not be saved.");
      return;
    }

    setSaved(true);
    router.refresh();
  }

  return (
    <form className="max-w-xl space-y-4 rounded-lg border border-ink/10 bg-white p-5" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="profile-name">Name</Label>
        <Input id="profile-name" name="name" defaultValue={user.name ?? ""} required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-email">Email</Label>
        <Input id="profile-email" value={user.email ?? ""} disabled readOnly />
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-image">Image URL</Label>
        <Input id="profile-image" name="image" type="url" defaultValue={user.image ?? ""} />
      </div>
      {error ? <p className="rounded-md bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p> : null}
      {saved ? <p className="rounded-md bg-mint px-3 py-2 text-sm text-ink">Profile saved.</p> : null}
      <Button type="submit" disabled={isSaving}>
        {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Save profile
      </Button>
    </form>
  );
}

