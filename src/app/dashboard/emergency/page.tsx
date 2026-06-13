import { RadioTower } from "lucide-react";

import { EmergencyCenter } from "@/components/dashboard/emergency-center";

export default function EmergencyPage() {
  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <p className="flex items-center gap-2 text-sm font-medium text-clay"><RadioTower className="h-4 w-4" />LETW welfare and emergency response</p>
        <h1 className="mt-2 text-3xl font-semibold">Emergency Command Center</h1>
        <p className="mt-2 max-w-3xl text-sm text-ink/60">Read official instructions and privately confirm whether you are safe or need assistance.</p>
      </section>
      <EmergencyCenter />
    </div>
  );
}
