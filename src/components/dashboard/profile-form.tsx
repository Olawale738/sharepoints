"use client";

import { useRouter } from "next/navigation";
import { Camera, Loader2, Save } from "lucide-react";
import { FormEvent, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { localeOptions, normalizeLocale } from "@/lib/i18n";

type ProfileFormProps = {
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    locale?: string | null;
    memberProfile?: {
      organizationPosition?: string | null;
      digitalIdLocation?: string | null;
    } | null;
  };
};

export function ProfileForm({ user }: ProfileFormProps) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imageUrl, setImageUrl] = useState(user.image ?? "");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSaved(false);
    setIsSaving(true);

    const formData = new FormData(event.currentTarget);
    const photo = formData.get("photo");
    let nextImageUrl = imageUrl;
    if (photo instanceof File && photo.size > 0) {
      const uploadData = new FormData();
      uploadData.set("photo", photo);
      const uploadResponse = await fetch("/api/profile/photo", { method: "POST", body: uploadData });
      const uploadResult = (await uploadResponse.json().catch(() => null)) as { imageUrl?: string; error?: string } | null;
      if (!uploadResponse.ok || !uploadResult?.imageUrl) {
        setIsSaving(false);
        setError(uploadResult?.error ?? "Profile photo could not be uploaded.");
        return;
      }
      nextImageUrl = uploadResult.imageUrl;
      setImageUrl(nextImageUrl);
    }
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(formData.get("name")),
        image: nextImageUrl,
        organizationPosition: String(formData.get("organizationPosition") ?? ""),
        digitalIdLocation: String(formData.get("digitalIdLocation") ?? ""),
        locale: String(formData.get("locale") ?? "en")
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
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="profile-position">Position in Light Encounter Tabernacle Worldwide</Label>
          <Input
            id="profile-position"
            name="organizationPosition"
            defaultValue={user.memberProfile?.organizationPosition ?? ""}
            placeholder="Pastor, leader, worker, member..."
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-id-location">Digital ID location</Label>
          <Input
            id="profile-id-location"
            name="digitalIdLocation"
            defaultValue={user.memberProfile?.digitalIdLocation ?? "LETTW Worldwide"}
            placeholder="Branch, city, region, or LETTW Worldwide"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-photo">Profile photo</Label>
        <div className="flex items-center gap-4">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-ink/10 bg-paper">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {imageUrl ? <img alt="Current profile" className="h-full w-full object-cover" src={imageUrl} /> : <Camera className="h-7 w-7 text-ink/35" />}
          </div>
          <div className="min-w-0 flex-1">
            <Input id="profile-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" />
            <p className="mt-1 text-xs text-ink/45">JPEG, PNG, or WebP. Maximum 5 MB.</p>
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-locale">Interface language</Label>
        <select
          id="profile-locale"
          name="locale"
          className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm"
          defaultValue={normalizeLocale(user.locale)}
        >
          {localeOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
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
