import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";

import { auth } from "@/auth";
import { AiAssistantPanel } from "@/components/dashboard/ai-assistant-panel";

export default async function AssistantPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <p className="flex items-center gap-2 text-sm font-medium text-moss"><Sparkles className="h-4 w-4" />LETW private intelligence</p>
        <h1 className="mt-2 text-3xl font-semibold text-ink">Permission-aware AI Assistant</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink/60">
          Search, summarize, draft, translate, and produce action items using only approved information your account can already access.
        </p>
      </section>
      <AiAssistantPanel />
    </div>
  );
}
