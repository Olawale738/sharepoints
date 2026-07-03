"use client";

import { Check, Clipboard, ExternalLink } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function PublicSiteIntegrationPanel({ feedUrl }: { feedUrl: string }) {
  const [copied, setCopied] = useState(false);

  async function copyFeed() {
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={copyFeed}>
        {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
        {copied ? "Copied" : "Copy feed URL"}
      </Button>
      <a
        className="inline-flex h-10 items-center gap-2 rounded-md border border-ink/10 bg-white px-4 text-sm font-medium text-ink hover:bg-mint/40"
        href={feedUrl}
        rel="noreferrer"
        target="_blank"
      >
        <ExternalLink className="h-4 w-4" />
        Open feed
      </a>
    </div>
  );
}
