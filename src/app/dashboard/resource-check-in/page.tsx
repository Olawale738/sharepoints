import { QrCode } from "lucide-react";

import { ResourceCheckInPanel } from "@/components/dashboard/resource-check-in-panel";

export default async function ResourceCheckInPage({
  searchParams
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <p className="flex items-center gap-2 text-sm font-medium text-moss"><QrCode className="h-4 w-4" />LETW smart building and resources</p>
        <h1 className="mt-2 text-3xl font-semibold">Resource Check-In</h1>
        <p className="mt-2 text-sm text-ink/60">Scan an approved room, vehicle, instrument, camera, accommodation, or equipment QR code to check it in or out.</p>
      </section>
      <ResourceCheckInPanel initialToken={token ?? ""} />
    </div>
  );
}
