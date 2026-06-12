import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { OnlyOfficeEditor } from "@/components/dashboard/onlyoffice-editor";

export default async function FileEditorPage({ params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  return (
    <div className="overflow-hidden rounded-lg border border-ink/10 bg-white">
      <div className="flex h-12 items-center border-b border-ink/10 px-4">
        <Link className="inline-flex items-center gap-2 text-sm font-medium text-moss" href="/dashboard">
          <ArrowLeft className="h-4 w-4" />
          Back to LETW
        </Link>
      </div>
      <OnlyOfficeEditor fileId={fileId} />
    </div>
  );
}
