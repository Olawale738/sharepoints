import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ProfileForm } from "@/components/dashboard/profile-form";

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold text-ink">Profile</h1>
        <p className="mt-2 text-sm text-ink/60">Manage your LETW account details.</p>
      </div>
      <ProfileForm user={session.user} />
    </div>
  );
}

