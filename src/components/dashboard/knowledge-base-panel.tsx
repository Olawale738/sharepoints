"use client";

import { BookOpen, Edit3, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { FormEvent, useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type WikiPage = {
  id: string;
  title: string;
  content: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  updatedAt: string;
  updatedBy?: { name?: string | null; email?: string | null };
};

export function KnowledgeBasePanel({ workspaceId, canManage }: { workspaceId: string; canManage: boolean }) {
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [activePage, setActivePage] = useState<WikiPage | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPages = useCallback(async () => {
    const response = await fetch(`/api/workspaces/${workspaceId}/wiki`);
    setLoading(false);

    if (!response.ok) return;
    const data = (await response.json()) as { pages: WikiPage[] };
    setPages(data.pages);
    setActivePage((current) => current ?? data.pages[0] ?? null);
  }, [workspaceId]);

  useEffect(() => {
    loadPages();
  }, [loadPages]);

  async function savePage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const formData = new FormData(event.currentTarget);
    const payload = {
      title: String(formData.get("title")),
      content: String(formData.get("content")),
      status: String(formData.get("status"))
    };
    const response = await fetch(activePage ? `/api/wiki/${activePage.id}` : `/api/workspaces/${workspaceId}/wiki`, {
      method: activePage ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = (await response.json().catch(() => null)) as { page?: WikiPage; error?: string } | null;

    if (!response.ok || !data?.page) {
      setError(data?.error ?? "Knowledge page could not be saved.");
      return;
    }

    setPages((current) => [data.page as WikiPage, ...current.filter((page) => page.id !== data.page?.id)]);
    setActivePage(data.page);
    setEditing(false);
  }

  async function deletePage() {
    if (!activePage || !window.confirm(`Delete "${activePage.title}"?`)) return;
    await fetch(`/api/wiki/${activePage.id}`, { method: "DELETE" });
    const remaining = pages.filter((page) => page.id !== activePage.id);
    setPages(remaining);
    setActivePage(remaining[0] ?? null);
  }

  return (
    <section className="overflow-hidden rounded-lg border border-ink/10 bg-white">
      <div className="flex items-center justify-between border-b border-ink/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-moss" />
          <h2 className="text-sm font-semibold">Knowledge base</h2>
        </div>
        {canManage ? (
          <Button
            className="h-9"
            variant="secondary"
            onClick={() => {
              setActivePage(null);
              setEditing(true);
            }}
          >
            <Plus className="h-4 w-4" />
            New page
          </Button>
        ) : null}
      </div>
      <div className="grid min-h-[24rem] md:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="border-b border-ink/10 bg-paper p-3 md:border-b-0 md:border-r">
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-moss" /> : null}
          {!loading && !pages.length ? <p className="text-sm text-ink/55">No knowledge pages yet.</p> : null}
          <div className="space-y-1">
            {pages.map((page) => (
              <button
                key={page.id}
                className={`w-full rounded-md px-3 py-2 text-left text-sm ${
                  activePage?.id === page.id ? "bg-moss text-white" : "hover:bg-mint"
                }`}
                type="button"
                onClick={() => {
                  setActivePage(page);
                  setEditing(false);
                }}
              >
                <span className="block truncate font-medium">{page.title}</span>
                <span className="text-xs opacity-70">{page.status.toLowerCase()}</span>
              </button>
            ))}
          </div>
        </aside>
        <div className="p-4">
          {editing ? (
            <form className="space-y-3" onSubmit={savePage}>
              <Input name="title" defaultValue={activePage?.title ?? ""} placeholder="Page title" required />
              <select
                className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm"
                name="status"
                defaultValue={activePage?.status ?? "DRAFT"}
              >
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
                <option value="ARCHIVED">Archived</option>
              </select>
              <Textarea
                className="min-h-64"
                name="content"
                defaultValue={activePage?.content ?? ""}
                placeholder="Write policies, guides, FAQs, or ministry knowledge..."
                required
              />
              {error ? <p className="text-sm text-clay">{error}</p> : null}
              <div className="flex gap-2">
                <Button type="submit">
                  <Save className="h-4 w-4" />
                  Save
                </Button>
                <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </form>
          ) : activePage ? (
            <article>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-semibold">{activePage.title}</h3>
                  <div className="mt-2 flex items-center gap-2">
                    <Badge className={activePage.status === "PUBLISHED" ? "bg-mint" : "bg-wheat"}>
                      {activePage.status.toLowerCase()}
                    </Badge>
                    <span className="text-xs text-ink/45">
                      Updated by {activePage.updatedBy?.name ?? activePage.updatedBy?.email ?? "LETW"}
                    </span>
                  </div>
                </div>
                {canManage ? (
                  <div className="flex gap-2">
                    <Button className="h-9 w-9 px-0" variant="secondary" onClick={() => setEditing(true)}>
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button className="h-9 w-9 px-0" variant="danger" onClick={deletePage}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
              <div className="mt-5 whitespace-pre-wrap text-sm leading-7 text-ink/80">{activePage.content}</div>
            </article>
          ) : (
            <p className="text-sm text-ink/55">Select a knowledge page.</p>
          )}
        </div>
      </div>
    </section>
  );
}
