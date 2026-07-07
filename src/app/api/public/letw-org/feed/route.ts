import { ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function publicOrigin() {
  return (process.env.AUTH_URL ?? "https://sharepoints.letw.org").replace(/\/$/, "");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://letw.org",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400"
};

function unauthorized() {
  return Response.json({ error: "Invalid public feed token." }, { status: 401, headers: corsHeaders });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders
  });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  const requiredToken = process.env.PUBLIC_SITE_FEED_TOKEN;

  if (requiredToken && token !== requiredToken) {
    return unauthorized();
  }

  const now = new Date();
  const [announcements, events, sermons, branches, forms] = await Promise.all([
    prisma.workspaceAnnouncement.findMany({
      where: {
        approvalStatus: "APPROVED",
        pinned: true,
        workspace: { deletedAt: null }
      },
      include: {
        workspace: { select: { id: true, name: true } }
      },
      orderBy: { createdAt: "desc" },
      take: 12
    }),
    prisma.churchEvent.findMany({
      where: {
        endsAt: { gte: now }
      },
      orderBy: { startsAt: "asc" },
      take: 24
    }),
    prisma.sermonResource.findMany({
      where: {
        visibility: "PUBLIC"
      },
      orderBy: { createdAt: "desc" },
      take: 24
    }),
    prisma.organizationUnit.findMany({
      where: {
        active: true,
        type: { in: ["COUNTRY", "REGION", "BRANCH", "CHURCH", "MINISTRY"] }
      },
      orderBy: [{ type: "asc" }, { name: "asc" }],
      take: 100
    }),
    prisma.workspaceForm.findMany({
      where: {
        status: "OPEN",
        workspace: { deletedAt: null }
      },
      include: {
        workspace: { select: { id: true, name: true } }
      },
      orderBy: { updatedAt: "desc" },
      take: 24
    })
  ]);

  return ok(
    {
      organization: "Light Encounter Tabernacle Worldwide",
      website: "https://letw.org",
      source: `${publicOrigin()}/api/public/letw-org/feed`,
      generatedAt: new Date().toISOString(),
      rules: {
        announcements: "approved and pinned",
        events: "upcoming only",
        sermons: "PUBLIC visibility only",
        branches: "active public organization units",
        forms: "open forms from active workspaces"
      },
      announcements: announcements.map((announcement) => ({
        id: announcement.id,
        title: announcement.title,
        body: announcement.body,
        workspace: announcement.workspace.name,
        createdAt: announcement.createdAt,
        url: `${publicOrigin()}/dashboard/workspaces/${announcement.workspaceId}`
      })),
      events: events.map((event) => ({
        id: event.id,
        title: event.title,
        description: event.description,
        eventType: event.eventType,
        location: event.location,
        startsAt: event.startsAt,
        endsAt: event.endsAt
      })),
      sermons: sermons.map((sermon) => ({
        id: sermon.id,
        title: sermon.title,
        speaker: sermon.speaker,
        scripture: sermon.scripture,
        language: sermon.language,
        mediaUrl: sermon.mediaUrl,
        notes: sermon.notes,
        createdAt: sermon.createdAt
      })),
      branches: branches.map((branch) => ({
        id: branch.id,
        type: branch.type,
        name: branch.name,
        code: branch.code,
        countryCode: branch.countryCode,
        description: branch.description,
        parentId: branch.parentId
      })),
      forms: forms.map((form) => ({
        id: form.id,
        title: form.title,
        description: form.description,
        workspace: form.workspace.name,
        updatedAt: form.updatedAt,
        url: `${publicOrigin()}/dashboard/workspaces/${form.workspaceId}`
      }))
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=600",
        ...corsHeaders
      }
    }
  );
}
