"use client";

import { BookOpen, ClipboardList, Edit3, FileText, HelpCircle, Landmark, Loader2, Plus, Save, ShieldCheck, Trash2 } from "lucide-react";
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

const knowledgeTemplates = [
  {
    title: "Doctrine note",
    description: "Teaching position, scripture references, and approved explanation.",
    icon: Landmark,
    pageTitle: "Doctrine: ",
    content:
      "Purpose\n\nScripture references\n\nLETW position\n\nTeaching notes\n\nApproved usage\n\nReview date"
  },
  {
    title: "Policy",
    description: "Rules, responsibilities, approvals, and compliance expectations.",
    icon: ShieldCheck,
    pageTitle: "Policy: ",
    content:
      "Policy purpose\n\nWho this applies to\n\nRequirements\n\nApproval or escalation process\n\nExceptions\n\nReview date"
  },
  {
    title: "Procedure",
    description: "Step-by-step operating instruction for teams and branches.",
    icon: ClipboardList,
    pageTitle: "Procedure: ",
    content:
      "Objective\n\nBefore you start\n\nSteps\n1. \n2. \n3. \n\nResponsible person or team\n\nRecords to keep\n\nReview date"
  },
  {
    title: "Branch manual",
    description: "Guidance for countries, regions, branches, churches, and ministries.",
    icon: BookOpen,
    pageTitle: "Branch manual: ",
    content:
      "Branch or ministry scope\n\nLeadership structure\n\nWeekly operations\n\nReporting expectations\n\nFacilities and resources\n\nImportant contacts\n\nReview date"
  },
  {
    title: "Training guide",
    description: "Worker onboarding, ministry training, and discipleship material.",
    icon: FileText,
    pageTitle: "Training guide: ",
    content:
      "Training objective\n\nAudience\n\nLesson outline\n\nKey scriptures or references\n\nPractical assignment\n\nAssessment or completion requirement"
  },
  {
    title: "Form guide",
    description: "Instructions for when and how a form should be used.",
    icon: FileText,
    pageTitle: "Form guide: ",
    content:
      "Form purpose\n\nWho should complete it\n\nRequired information\n\nReview or approval process\n\nWhere the response is stored"
  },
  {
    title: "FAQ",
    description: "Common questions and answers for members or workers.",
    icon: HelpCircle,
    pageTitle: "FAQ: ",
    content:
      "Question\nAnswer\n\nQuestion\nAnswer\n\nQuestion\nAnswer"
  }
];

export function KnowledgeBasePanel({ workspaceId, canManage }: { workspaceId: string; canManage: boolean }) {
  const [pages, setPages] = useState<WikiPage[]>([]);
  const [activePage, setActivePage] = useState<WikiPage | null>(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [draftStatus, setDraftStatus] = useState<WikiPage["status"]>("DRAFT");

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
    setDraftTitle("");
    setDraftContent("");
    setDraftStatus("DRAFT");
    setEditing(false);
  }

  async function deletePage() {
    if (!activePage || !window.confirm(`Delete "${activePage.title}"?`)) return;
    await fetch(`/api/wiki/${activePage.id}`, { method: "DELETE" });
    const remaining = pages.filter((page) => page.id !== activePage.id);
    setPages(remaining);
    setActivePage(remaining[0] ?? null);
  }

  function startNewPage(template?: (typeof knowledgeTemplates)[number]) {
    setActivePage(null);
    setDraftTitle(template?.pageTitle ?? "");
    setDraftContent(template?.content ?? "");
    setDraftStatus("DRAFT");
    setError("");
    setEditing(true);
  }

  return (
    <section id="knowledge" className="scroll-mt-24 overflow-hidden rounded-lg border border-ink/10 bg-white">
      <div className="flex flex-col gap-3 border-b border-ink/10 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <BookOpen className="h-4 w-4 text-moss" />
            Workspace Knowledge Base
          </p>
          <p className="mt-1 max-w-2xl text-xs leading-5 text-ink/55">
            Create doctrines, policies, procedures, branch manuals, training guides, form instructions, and FAQs for this workspace.
          </p>
        </div>
        {canManage ? (
          <Button
            className="h-9"
            variant="secondary"
            onClick={() => startNewPage()}
          >
            <Plus className="h-4 w-4" />
            Create knowledge page
          </Button>
        ) : null}
      </div>
      <div className="grid min-h-[24rem] md:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="border-b border-ink/10 bg-paper p-3 md:border-b-0 md:border-r">
          {loading ? <Loader2 className="h-4 w-4 animate-spin text-moss" /> : null}
          {!loading && !pages.length ? (
            <div className="rounded-md bg-white p-3 text-sm text-ink/55">
              <p>No knowledge pages yet.</p>
              {canManage ? (
                <button className="mt-2 text-xs font-semibold text-moss hover:underline" type="button" onClick={() => startNewPage()}>
                  Create the first page
                </button>
              ) : null}
            </div>
          ) : null}
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
            <form key={activePage?.id ?? `new-${draftTitle}`} className="space-y-3" onSubmit={savePage}>
              <Input name="title" defaultValue={activePage?.title ?? draftTitle} placeholder="Page title" required />
              <select
                className="h-10 w-full rounded-md border border-ink/10 bg-white px-3 text-sm"
                name="status"
                defaultValue={activePage?.status ?? draftStatus}
              >
                <option value="DRAFT">Draft</option>
                <option value="PUBLISHED">Published</option>
                <option value="ARCHIVED">Archived</option>
              </select>
              <Textarea
                className="min-h-64"
                name="content"
                defaultValue={activePage?.content ?? draftContent}
                placeholder="Write doctrines, policies, procedures, manuals, training guides, form instructions, or FAQs..."
                required
              />
              {error ? <p className="text-sm text-clay">{error}</p> : null}
              <div className="flex gap-2">
                <Button type="submit">
                  <Save className="h-4 w-4" />
                  Save
                </Button>
                <Button variant="secondary" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : activePage ? (
            <div className="space-y-5">
              {canManage ? (
                <div className="rounded-lg border border-ink/10 bg-paper p-3">
                  <p className="text-sm font-semibold text-ink">Create from a starter template</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {knowledgeTemplates.map((template) => {
                      const Icon = template.icon;

                      return (
                        <button
                          className="rounded-md border border-ink/10 bg-white p-3 text-left transition hover:bg-mint/40"
                          key={template.title}
                          type="button"
                          onClick={() => startNewPage(template)}
                        >
                          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                            <Icon className="h-4 w-4 text-moss" />
                            {template.title}
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-ink/55">{template.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
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
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-ink/55">Select a knowledge page.</p>
              {canManage ? (
                <div className="rounded-lg border border-ink/10 bg-paper p-3">
                  <p className="text-sm font-semibold text-ink">Create from a starter template</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {knowledgeTemplates.map((template) => {
                      const Icon = template.icon;

                      return (
                        <button
                          className="rounded-md border border-ink/10 bg-white p-3 text-left transition hover:bg-mint/40"
                          key={template.title}
                          type="button"
                          onClick={() => startNewPage(template)}
                        >
                          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                            <Icon className="h-4 w-4 text-moss" />
                            {template.title}
                          </span>
                          <span className="mt-1 block text-xs leading-5 text-ink/55">{template.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
