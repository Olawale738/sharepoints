"use client";

import { Check, Clipboard, Code2, ExternalLink } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export function PublicSiteIntegrationPanel({ feedUrl, configured }: { feedUrl: string; configured: boolean }) {
  const [copied, setCopied] = useState(false);
  const [snippetCopied, setSnippetCopied] = useState(false);
  const snippet = `const response = await fetch("${feedUrl}", { cache: "no-store" });\nconst letwContent = await response.json();`;

  async function copyFeed() {
    await navigator.clipboard.writeText(feedUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  async function copySnippet() {
    await navigator.clipboard.writeText(snippet);
    setSnippetCopied(true);
    window.setTimeout(() => setSnippetCopied(false), 1800);
  }

  return (
    <div className="w-full max-w-xl rounded-lg border border-ink/10 bg-paper p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${configured ? "bg-mint text-moss" : "bg-wheat text-ink"}`}>
          {configured ? "feed token configured" : "feed token missing"}
        </span>
        <div className="flex flex-wrap gap-2">
          <Button className="h-9" variant="secondary" onClick={copyFeed}>
            {copied ? <Check className="h-4 w-4" /> : <Clipboard className="h-4 w-4" />}
            {copied ? "Copied" : "Copy URL"}
          </Button>
          <Button className="h-9" variant="secondary" onClick={copySnippet}>
            {snippetCopied ? <Check className="h-4 w-4" /> : <Code2 className="h-4 w-4" />}
            {snippetCopied ? "Copied" : "Copy code"}
          </Button>
          <a
            className="inline-flex h-9 items-center gap-2 rounded-md border border-ink/10 bg-white px-3 text-sm font-medium text-ink hover:bg-mint/40"
            href={feedUrl}
            rel="noreferrer"
            target="_blank"
          >
            <ExternalLink className="h-4 w-4" />
            Open
          </a>
        </div>
      </div>
      <p className="mt-3 break-all rounded-md bg-white px-3 py-2 text-xs leading-5 text-ink/65">{feedUrl}</p>
      <pre className="mt-3 overflow-x-auto rounded-md bg-[#0b1b3d] p-3 text-xs leading-5 text-white">
        <code>{snippet}</code>
      </pre>
    </div>
  );
}
