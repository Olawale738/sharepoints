import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { ExecutiveCommandCenterPanel } from "@/components/dashboard/executive-command-center-panel";
import { getExecutiveCommandCenterData } from "@/lib/executive-command-center";

export default async function ExecutiveBriefingPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const data = await getExecutiveCommandCenterData(session.user.id).catch(() => null);

  if (!data) {
    return (
      <section className="rounded-lg border border-ink/10 bg-white p-6 shadow-soft">
        <p className="text-sm font-medium text-moss">Executive briefing room</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink">Permission required</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/60">
          Ask an administrator to grant executive briefing, WhatsApp command, digital signing, or evidence vault permissions to your leader or moderator role.
        </p>
      </section>
    );
  }

  return <ExecutiveCommandCenterPanel initialData={JSON.parse(JSON.stringify(data))} />;
}
