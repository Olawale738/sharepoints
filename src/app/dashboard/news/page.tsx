import { Newspaper } from "lucide-react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { InternalNewsFeedPanel } from "@/components/dashboard/internal-news-feed-panel";

export default async function InternalNewsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5">
        <p className="flex items-center gap-2 text-sm font-medium text-moss">
          <Newspaper className="h-4 w-4" />
          LETW internal news
        </p>
        <h1 className="mt-2 text-3xl font-semibold">News feed</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink/60">
          Read LETW-wide announcements, branch updates, ministry reports, comments, and reactions.
        </p>
      </section>
      <InternalNewsFeedPanel />
    </div>
  );
}
