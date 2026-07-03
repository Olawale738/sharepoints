import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, ClipboardList, FileText, HelpCircle, Landmark, Search, ShieldCheck } from "lucide-react";
import { WikiPageStatus, WorkspaceRole } from "@prisma/client";

import { auth } from "@/auth";
import { Badge } from "@/components/ui/badge";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";

const knowledgeSections = [
  {
    title: "Doctrines",
    detail: "Core beliefs, biblical positions, teaching references, and ministry doctrine notes.",
    icon: Landmark
  },
  {
    title: "Policies",
    detail: "Leadership, safeguarding, data, finance, attendance, and workspace policies.",
    icon: ShieldCheck
  },
  {
    title: "Procedures",
    detail: "Step-by-step operational instructions for branches, ministries, events, media, and care teams.",
    icon: ClipboardList
  },
  {
    title: "Branch manuals",
    detail: "Country, region, branch, church, and ministry unit operating manuals.",
    icon: BookOpen
  },
  {
    title: "Forms and templates",
    detail: "Frequently used forms, onboarding templates, service checklists, and reusable documents.",
    icon: FileText
  },
  {
    title: "FAQs",
    detail: "Common member, worker, admin, event, meeting, and digital ID questions.",
    icon: HelpCircle
  }
];

export default async function KnowledgeBasePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const ownMemberships = await prisma.workspaceMember.findMany({
    where: { userId: session.user.id, workspace: { deletedAt: null } },
    select: {
      workspaceId: true,
      role: true
    }
  });
  const isAdmin = ownMemberships.some((membership) => membership.role === WorkspaceRole.ADMIN);
  const workspaceIds = isAdmin
    ? (
        await prisma.workspace.findMany({
          where: { deletedAt: null },
          select: { id: true }
        })
      ).map((workspace) => workspace.id)
    : ownMemberships.map((membership) => membership.workspaceId);

  const pages = workspaceIds.length
    ? await prisma.wikiPage.findMany({
        where: {
          workspaceId: { in: workspaceIds },
          OR: [{ status: WikiPageStatus.PUBLISHED }, { authorId: session.user.id }]
        },
        include: {
          workspace: {
            select: {
              id: true,
              name: true
            }
          },
          updatedBy: {
            select: {
              name: true,
              email: true
            }
          }
        },
        orderBy: [{ status: "desc" }, { updatedAt: "desc" }],
        take: 200
      })
    : [];

  const publishedCount = pages.filter((page) => page.status === WikiPageStatus.PUBLISHED).length;
  const draftCount = pages.filter((page) => page.status === WikiPageStatus.DRAFT).length;
  const archivedCount = pages.filter((page) => page.status === WikiPageStatus.ARCHIVED).length;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-white p-5 shadow-soft">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-moss">
              <BookOpen className="h-4 w-4" />
              LETW Knowledge Base
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink">Doctrines, policies, manuals, forms, guides, and FAQs</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/60">
              A permission-aware internal wiki. Members only see published pages from workspaces they can access, while admins can review
              knowledge across LETW.
            </p>
          </div>
          <div className="grid min-w-72 grid-cols-3 gap-2 rounded-lg border border-ink/10 bg-paper p-3 text-center">
            <div>
              <p className="text-2xl font-semibold text-ink">{publishedCount}</p>
              <p className="text-xs text-ink/55">Published</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-ink">{draftCount}</p>
              <p className="text-xs text-ink/55">Drafts</p>
            </div>
            <div>
              <p className="text-2xl font-semibold text-ink">{archivedCount}</p>
              <p className="text-xs text-ink/55">Archived</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {knowledgeSections.map((section) => {
          const Icon = section.icon;

          return (
            <div className="rounded-lg border border-ink/10 bg-white p-4" key={section.title}>
              <Icon className="h-5 w-5 text-moss" />
              <p className="mt-3 text-sm font-semibold text-ink">{section.title}</p>
              <p className="mt-2 text-xs leading-5 text-ink/55">{section.detail}</p>
            </div>
          );
        })}
      </section>

      <section className="rounded-lg border border-ink/10 bg-white">
        <div className="flex flex-col gap-2 border-b border-ink/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Search className="h-4 w-4 text-moss" />
              Available knowledge pages
            </p>
            <p className="mt-1 text-xs text-ink/55">Open a workspace to create or edit its knowledge pages.</p>
          </div>
          <Badge>{pages.length} pages</Badge>
        </div>
        <div className="divide-y divide-ink/10">
          {pages.length === 0 ? (
            <p className="px-4 py-10 text-sm text-ink/55">No knowledge pages are available yet.</p>
          ) : null}
          {pages.map((page) => (
            <Link
              className="block px-4 py-4 transition hover:bg-mint/35"
              href={`/dashboard/workspaces/${page.workspaceId}#knowledge`}
              key={page.id}
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{page.title}</p>
                  <p className="mt-1 line-clamp-2 text-sm text-ink/60">{page.content}</p>
                  <p className="mt-2 text-xs text-ink/45">
                    {page.workspace.name} - updated by {page.updatedBy.name ?? page.updatedBy.email ?? "LETW"} - {formatDate(page.updatedAt)}
                  </p>
                </div>
                <Badge className={page.status === WikiPageStatus.PUBLISHED ? "bg-mint" : page.status === WikiPageStatus.DRAFT ? "bg-wheat" : "bg-paper"}>
                  {page.status.toLowerCase()}
                </Badge>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
