import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ProfileForm } from "@/components/dashboard/profile-form";
import { SecurityProfilePanel } from "@/components/dashboard/security-profile-panel";
import { NotificationSettingsPanel } from "@/components/dashboard/notification-settings-panel";
import { prisma } from "@/lib/prisma";

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }
  const profile = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      image: true,
      locale: true,
      memberProfile: {
        select: {
          organizationPosition: true,
          digitalIdLocation: true
        }
      }
    }
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-semibold text-ink">Profile</h1>
        <p className="mt-2 text-sm text-ink/60">Manage your LETW account details.</p>
      </div>
      <ProfileForm user={profile ?? session.user} />
      <NotificationSettingsPanel />
      <SecurityProfilePanel />
    </div>
  );
}
