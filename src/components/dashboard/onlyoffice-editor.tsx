"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (id: string, config: Record<string, unknown>) => { destroyEditor: () => void };
    };
  }
}

export function OnlyOfficeEditor({ fileId }: { fileId: string }) {
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let editor: { destroyEditor: () => void } | undefined;
    let script: HTMLScriptElement | undefined;

    async function load() {
      const response = await fetch(`/api/files/${fileId}/onlyoffice/config`);
      const data = (await response.json()) as {
        serverUrl?: string;
        config?: Record<string, unknown>;
        error?: string;
      };
      if (!response.ok || !data.serverUrl || !data.config) {
        setError(data.error ?? "Editor configuration could not be loaded.");
        return;
      }

      script = document.createElement("script");
      script.src = `${data.serverUrl}/web-apps/apps/api/documents/api.js`;
      script.onload = () => {
        if (!window.DocsAPI || !containerRef.current) {
          setError("OnlyOffice did not initialize.");
          return;
        }
        editor = new window.DocsAPI.DocEditor("onlyoffice-editor", {
          ...data.config,
          width: "100%",
          height: "100%"
        });
      };
      script.onerror = () => setError("OnlyOffice document server could not be reached.");
      document.body.appendChild(script);
    }

    void load();
    return () => {
      editor?.destroyEditor();
      script?.remove();
    };
  }, [fileId]);

  if (error) {
    return <div className="m-6 rounded-lg border border-clay/20 bg-clay/10 p-4 text-sm text-clay">{error}</div>;
  }

  return (
    <div ref={containerRef} className="h-[calc(100vh-5rem)] min-h-[42rem] bg-white">
      <div id="onlyoffice-editor" className="h-full w-full">
        <p className="flex items-center gap-2 p-6 text-sm text-ink/55">
          <Loader2 className="h-4 w-4 animate-spin" />
          Opening collaborative editor
        </p>
      </div>
    </div>
  );
}
